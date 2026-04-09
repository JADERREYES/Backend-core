import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

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
      hostname.startsWith('frontend-usuario-') ||
      hostname.startsWith('frontend-super-admin-')
    );
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  const defaultOrigins = [
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

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      const isAllowed =
        allowedOrigins.has(normalizedOrigin) ||
        isAllowedVercelPreview(normalizedOrigin);

      callback(null, isAllowed);
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

  const storageProvider = configService.get<string>('STORAGE_PROVIDER') || 'local';

  if (storageProvider === 'local') {
    app.useStaticAssets(join(process.cwd(), 'uploads'), {
      prefix: '/uploads/',
    });
  }

  const port = configService.get<number>('PORT') || 3000;

  await app.listen(port);
  console.log(`🚀 Backend corriendo en http://localhost:${port}`);
}

void bootstrap();
