import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';
import * as dns from 'dns';

const logger = new Logger('MongoDBConfig');

function describeMongoTarget(uri: string, dbName: string) {
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${dbName}`;
  } catch {
    return `database ${dbName}`;
  }
}

function getRequiredConfig(configService: ConfigService, key: string) {
  const value = configService.get<string>(key)?.trim();

  if (!value) {
    throw new Error(`${key} is not defined in environment variables`);
  }

  return value;
}

function parseDnsServers(rawServers: string) {
  return rawServers
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
}

function configureTemporaryDnsOverride(configService: ConfigService) {
  const rawServers = configService.get<string>('MONGODB_DNS_SERVERS');

  if (!rawServers) {
    return;
  }

  const servers = parseDnsServers(rawServers);

  if (servers.length === 0) {
    throw new Error('MONGODB_DNS_SERVERS is defined but empty');
  }

  dns.setServers(servers);
  logger.warn(
    `Using temporary MongoDB DNS SRV workaround: ${dns.getServers().join(', ')}. This is for local development only; fix the OS/network DNS resolver instead of keeping this permanently.`,
  );
}

function getMongoSrvRecord(uri: string) {
  const parsed = new URL(uri);
  return `_mongodb._tcp.${parsed.hostname}`;
}

async function warnIfMongoSrvIsNotResolvable(uri: string) {
  if (!uri.startsWith('mongodb+srv://')) {
    return;
  }

  const srvRecord = getMongoSrvRecord(uri);
  const activeDnsServers = dns.getServers();

  try {
    await dns.promises.resolveSrv(srvRecord);
  } catch (error) {
    const code =
      error instanceof Error && 'code' in error
        ? String((error as Error & { code?: string }).code)
        : 'UNKNOWN';

    logger.warn(
      [
        `MongoDB SRV DNS lookup failed for ${srvRecord}.`,
        `DNS error code: ${code}.`,
        `Node DNS servers: ${activeDnsServers.join(', ') || 'system default'}.`,
        'Startup will continue and let the MongoDB driver attempt the real Atlas connection.',
        'Keep mongodb+srv for MongoDB Atlas. For local development only, you can set MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8 in .env.',
      ].join(' '),
    );
  }
}

export async function createMongooseOptions(
  configService: ConfigService,
): Promise<MongooseModuleOptions> {
  configureTemporaryDnsOverride(configService);

  const uri = getRequiredConfig(configService, 'MONGODB_URI');
  const dbName = getRequiredConfig(configService, 'MONGODB_DB_NAME');
  const mongoTarget = describeMongoTarget(uri, dbName);

  await warnIfMongoSrvIsNotResolvable(uri);
  logger.log(`Preparing MongoDB connection to ${mongoTarget}`);

  return {
    uri,
    dbName,
    serverSelectionTimeoutMS: 10000,
    connectionFactory: (connection) => {
      connection.on('connected', () => {
        logger.log(`MongoDB connected to ${mongoTarget}`);
      });
      connection.on('error', (error) => {
        logger.error(
          `MongoDB connection error for ${mongoTarget}: ${error.message}`,
        );
      });
      connection.on('disconnected', () => {
        logger.warn(`MongoDB disconnected from ${mongoTarget}`);
      });

      return connection;
    },
  };
}
