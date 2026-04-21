import { isIP } from 'net';

type EnvironmentVariables = Record<string, string | undefined>;

const REQUIRED_VARIABLES = [
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
] as const;

const OPTIONAL_NUMBER_VARIABLES = [
  'PORT',
  'FREE_DAILY_LIMIT',
  'FREE_MONTHLY_LIMIT',
  'PREMIUM_DAILY_LIMIT',
  'PREMIUM_MONTHLY_LIMIT',
  'THROTTLE_TTL_MS',
  'THROTTLE_LIMIT',
] as const;

const OPTIONAL_VARIABLES = [
  'CORS_ORIGINS',
  'OPENAI_API_KEY',
  'OPENAI_CHAT_MODEL',
  'OPENAI_EMBEDDING_MODEL',
  'MONGODB_ATLAS_VECTOR_INDEX',
  'MONGODB_DNS_SERVERS',
  'REDIS_URL',
  'STORAGE_PROVIDER',
  'BLOB_READ_WRITE_TOKEN',
  'STORAGE_ALLOWED_REMOTE_HOST',
  'NODE_ENV',
  'ENFORCE_HTTPS',
  'ENABLE_PUBLIC_UPLOADS',
  'EMAIL_PROVIDER',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'SMS_PROVIDER',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
] as const;

const OPTIONAL_BOOLEAN_VARIABLES = [
  'ENFORCE_HTTPS',
  'ENABLE_PUBLIC_UPLOADS',
] as const;

function requireNonEmpty(env: EnvironmentVariables, key: string) {
  const value = env[key];

  if (!value || !value.trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

function validateOptionalPositiveInteger(
  env: EnvironmentVariables,
  key: string,
) {
  const value = env[key];

  if (!value) {
    return;
  }

  if (!/^[1-9]\d*$/.test(value.trim())) {
    throw new Error(`Environment variable ${key} must be a positive integer`);
  }
}

function validateMongoUri(uri: string) {
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }

  new URL(uri);
}

function validateMongoDbName(env: EnvironmentVariables) {
  const value = env.MONGODB_DB_NAME?.trim();

  if (!value) {
    throw new Error('MONGODB_DB_NAME must not be empty');
  }

  if (env.NODE_ENV === 'production' && value.toLowerCase() === 'test') {
    throw new Error(
      'MONGODB_DB_NAME cannot be "test" when NODE_ENV=production',
    );
  }
}

function validateJwtExpiresIn(value: string) {
  const trimmedValue = value.trim();

  if (/^[1-9]\d*$/.test(trimmedValue)) {
    return;
  }

  if (/^[1-9]\d*(ms|s|m|h|d|w|y)$/.test(trimmedValue)) {
    return;
  }

  throw new Error(
    'JWT_EXPIRES_IN must be a number of seconds or a duration like 30m, 1h, or 7d',
  );
}

function validateJwtSecret(value: string) {
  if (value.trim().length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
}

function validatePort(env: EnvironmentVariables) {
  const value = env.PORT;

  if (!value) {
    return;
  }

  validateOptionalPositiveInteger(env, 'PORT');

  const port = Number(value.trim());
  if (port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
}

function validateCorsOrigins(env: EnvironmentVariables) {
  const value = env.CORS_ORIGINS;

  if (!value) {
    return;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('CORS_ORIGINS is defined but empty');
  }

  for (const origin of origins) {
    if (origin !== '*') {
      new URL(origin);
    }
  }
}

function validateMongoDnsServers(env: EnvironmentVariables) {
  const value = env.MONGODB_DNS_SERVERS;

  if (!value) {
    return;
  }

  const servers = value
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length === 0) {
    throw new Error('MONGODB_DNS_SERVERS is defined but empty');
  }

  for (const server of servers) {
    if (isIP(server) === 0) {
      throw new Error(
        'MONGODB_DNS_SERVERS must contain comma-separated IP addresses',
      );
    }
  }
}

function validateStorageProvider(env: EnvironmentVariables) {
  const value = env.STORAGE_PROVIDER;

  if (!value) {
    return;
  }

  const storageProvider = value.trim();
  if (!['local', 'vercel-blob'].includes(storageProvider)) {
    throw new Error('STORAGE_PROVIDER must be local or vercel-blob');
  }

  if (storageProvider === 'vercel-blob') {
    requireNonEmpty(env, 'BLOB_READ_WRITE_TOKEN');
  }
}

function validateOptionalBoolean(
  env: EnvironmentVariables,
  key: string,
) {
  const value = env[key];

  if (!value) {
    return;
  }

  if (!['true', 'false'].includes(value.trim())) {
    throw new Error(`Environment variable ${key} must be true or false`);
  }
}

function validateStorageAllowedRemoteHosts(env: EnvironmentVariables) {
  const value = env.STORAGE_ALLOWED_REMOTE_HOST;

  if (!value) {
    return;
  }

  const hosts = value
    .split(/[,\n]/)
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (hosts.length === 0) {
    throw new Error('STORAGE_ALLOWED_REMOTE_HOST is defined but empty');
  }

  for (const host of hosts) {
    if (
      host.includes('://') ||
      host.includes('/') ||
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      isIP(host) !== 0
    ) {
      throw new Error(
        'STORAGE_ALLOWED_REMOTE_HOST must contain only public hostnames',
      );
    }
  }
}

function validateRedisUrl(env: EnvironmentVariables) {
  const value = env.REDIS_URL?.trim();

  if (!value) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('REDIS_URL must be a valid URL');
  }

  if (
    env.NODE_ENV === 'production' &&
    ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())
  ) {
    throw new Error(
      'REDIS_URL cannot point to localhost in production. Remove it or use a managed Redis service.',
    );
  }
}

function validateNotificationProviders(env: EnvironmentVariables) {
  const emailProvider = env.EMAIL_PROVIDER?.trim() || 'none';
  if (emailProvider && !['none', 'resend'].includes(emailProvider)) {
    throw new Error('EMAIL_PROVIDER must be none or resend');
  }

  if (emailProvider === 'resend') {
    requireNonEmpty(env, 'RESEND_API_KEY');
    requireNonEmpty(env, 'EMAIL_FROM');
  }

  const smsProvider = env.SMS_PROVIDER?.trim() || 'none';
  if (smsProvider && !['none', 'twilio'].includes(smsProvider)) {
    throw new Error('SMS_PROVIDER must be none or twilio');
  }

  if (smsProvider === 'twilio') {
    requireNonEmpty(env, 'TWILIO_ACCOUNT_SID');
    requireNonEmpty(env, 'TWILIO_AUTH_TOKEN');
    const fromNumber = requireNonEmpty(env, 'TWILIO_FROM_NUMBER');
    if (!/^\+[1-9]\d{7,14}$/.test(fromNumber)) {
      throw new Error('TWILIO_FROM_NUMBER must use E.164 format');
    }
  }
}

export function validateEnv(config: EnvironmentVariables) {
  const validatedConfig: EnvironmentVariables = { ...config };

  for (const key of REQUIRED_VARIABLES) {
    validatedConfig[key] = requireNonEmpty(config, key);
  }

  for (const key of OPTIONAL_NUMBER_VARIABLES) {
    validateOptionalPositiveInteger(config, key);

    if (config[key]) {
      validatedConfig[key] = config[key]?.trim();
    }
  }

  for (const key of OPTIONAL_BOOLEAN_VARIABLES) {
    validateOptionalBoolean(config, key);

    if (config[key]) {
      validatedConfig[key] = config[key]?.trim();
    }
  }

  for (const key of OPTIONAL_VARIABLES) {
    if (config[key]) {
      validatedConfig[key] = config[key]?.trim();
    }
  }

  validatePort(validatedConfig);
  validateMongoUri(validatedConfig.MONGODB_URI);
  validateMongoDbName(validatedConfig);
  validateJwtSecret(validatedConfig.JWT_SECRET);
  validateJwtExpiresIn(validatedConfig.JWT_EXPIRES_IN);
  validateCorsOrigins(validatedConfig);
  validateMongoDnsServers(validatedConfig);
  validateRedisUrl(validatedConfig);
  validateStorageProvider(validatedConfig);
  validateStorageAllowedRemoteHosts(validatedConfig);
  validateNotificationProviders(validatedConfig);

  return validatedConfig;
}
