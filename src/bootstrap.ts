import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, NestExpressApplication } from '@nestjs/platform-express';
import { NextFunction, Request, Response } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

const bootstrapLogger = new Logger('Bootstrap');

function logEnvironmentSummary(configService: ConfigService) {
  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';
  const mongoDbName =
    configService.get<string>('MONGODB_DB_NAME') || '(missing)';
  const corsOrigins = configService.get<string>('CORS_ORIGINS') || '';
  const redisUrl = configService.get<string>('REDIS_URL') || '';
  const mongoUri = configService.get<string>('MONGODB_URI') || '';
  const jwtSecret = configService.get<string>('JWT_SECRET') || '';

  bootstrapLogger.log(
    [
      `Runtime summary: NODE_ENV=${nodeEnv}`,
      `MONGODB_DB_NAME=${mongoDbName}`,
      `MONGODB_URI_CONFIGURED=${mongoUri ? 'yes' : 'no'}`,
      `JWT_SECRET_CONFIGURED=${jwtSecret ? 'yes' : 'no'}`,
      `CORS_ORIGINS_CONFIGURED=${corsOrigins ? 'yes' : 'no'}`,
      `REDIS_CONFIGURED=${redisUrl ? 'yes' : 'no'}`,
      `VERCEL_ENV=${process.env.VERCEL_ENV || 'not_set'}`,
      `RENDER=${process.env.RENDER ? 'yes' : 'no'}`,
    ].join(' | '),
  );

  if (process.env.VERCEL && nodeEnv !== 'production') {
    bootstrapLogger.warn(
      'Running on Vercel with NODE_ENV different from production.',
    );
  }

  if (process.env.RENDER && nodeEnv !== 'production') {
    bootstrapLogger.warn(
      'Running on Render with NODE_ENV different from production.',
    );
  }

  if (nodeEnv === 'production' && !corsOrigins.trim()) {
    bootstrapLogger.warn(
      'CORS_ORIGINS is empty in production. Browser clients may be blocked.',
    );
  }
}

function normalizeOrigin(origin: string) {
  return origin
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function isAllowedVercelPreview(origin: string) {
  try {
    const { protocol, hostname } = new URL(origin);

    if (protocol !== 'https:') {
      return false;
    }

    if (!hostname.endsWith('.vercel.app')) {
      return false;
    }

    return (
      hostname === 'frontend-usuario.vercel.app' ||
      hostname === 'frontend-super-admin.vercel.app' ||
      hostname.startsWith('frontend-usuario-') ||
      hostname.startsWith('frontend-super-admin-')
    );
  } catch {
    return false;
  }
}

function applyAppConfiguration(
  app: NestExpressApplication,
  configService: ConfigService,
) {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.set('trust proxy', 1);
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

    if (isProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    next();
  });

  if (configService.get<string>('ENFORCE_HTTPS') === 'true') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const forwardedProto = req.headers['x-forwarded-proto'];
      if (forwardedProto && forwardedProto !== 'https') {
        res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
        return;
      }
      next();
    });
  }

  const defaultOrigins = isProduction
    ? []
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:5173',
        'http://localhost:5174',
      ].map(normalizeOrigin);

  const configuredOrigins = (configService.get<string>('CORS_ORIGINS') || '')
    .split(/[,\n]/)
    .map(normalizeOrigin)
    .filter(Boolean);

  const allowedOrigins = new Set(
    new Set([...defaultOrigins, ...configuredOrigins]),
  );

  const isOriginAllowed = (origin?: string | null) => {
    if (!origin) {
      return true;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    return (
      allowedOrigins.has(normalizedOrigin) ||
      isAllowedVercelPreview(normalizedOrigin)
    );
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestOrigin =
      typeof req.headers.origin === 'string' ? req.headers.origin : '';

    if (requestOrigin && isOriginAllowed(requestOrigin)) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header(
        'Access-Control-Allow-Methods',
        'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      );
      res.header(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, Accept, Origin, X-Requested-With',
      );
    }

    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }

    next();
  });

  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isOriginAllowed(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const storageProvider =
    configService.get<string>('STORAGE_PROVIDER') || 'local';
  const publicUploadsEnabled =
    !isProduction ||
    configService.get<string>('ENABLE_PUBLIC_UPLOADS') === 'true';

  if (storageProvider === 'local' && publicUploadsEnabled) {
    app.useStaticAssets(join(process.cwd(), 'uploads', 'avatars'), {
      prefix: '/uploads/avatars/',
    });
  }
}

export async function createConfiguredApp(
  adapter?: ExpressAdapter,
): Promise<NestExpressApplication> {
  bootstrapLogger.log(
    `Creating Nest application (${adapter ? 'serverless' : 'standalone'})`,
  );
  const app = adapter
    ? await NestFactory.create<NestExpressApplication>(AppModule, adapter)
    : await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  applyAppConfiguration(app, configService);
  logEnvironmentSummary(configService);
  bootstrapLogger.log(
    `Nest application configured for ${
      configService.get<string>('NODE_ENV') || 'development'
    } environment`,
  );

  return app;
}

export async function bootstrapStandalone() {
  const app = await createConfiguredApp();
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT') || 3000;
  const host =
    configService.get<string>('HOST') ||
    (configService.get<string>('NODE_ENV') === 'production'
      ? '0.0.0.0'
      : '0.0.0.0');

  await app.listen(port, host);
  bootstrapLogger.log(
    `Backend running on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
  );
  bootstrapLogger.log(
    `Health endpoints available at / and /health on port ${port}`,
  );
}
