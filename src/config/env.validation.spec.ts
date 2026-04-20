import { validateEnv } from './env.validation';

const createBaseEnv = () => ({
  MONGODB_URI: 'mongodb://localhost:27017/menteamiga',
  MONGODB_DB_NAME: 'menteamiga',
  JWT_SECRET: '12345678901234567890123456789012',
  JWT_EXPIRES_IN: '1h',
});

describe('validateEnv', () => {
  it('accepts a minimal valid configuration', () => {
    expect(validateEnv(createBaseEnv())).toEqual(createBaseEnv());
  });

  it('rejects invalid boolean flags', () => {
    expect(() =>
      validateEnv({
        ...createBaseEnv(),
        ENFORCE_HTTPS: 'yes',
      }),
    ).toThrow('Environment variable ENFORCE_HTTPS must be true or false');
  });

  it('requires a blob token when vercel blob storage is selected', () => {
    expect(() =>
      validateEnv({
        ...createBaseEnv(),
        STORAGE_PROVIDER: 'vercel-blob',
      }),
    ).toThrow('Missing required environment variable: BLOB_READ_WRITE_TOKEN');
  });

  it('rejects private or malformed allowed remote hosts', () => {
    expect(() =>
      validateEnv({
        ...createBaseEnv(),
        STORAGE_ALLOWED_REMOTE_HOST: 'https://localhost/files',
      }),
    ).toThrow(
      'STORAGE_ALLOWED_REMOTE_HOST must contain only public hostnames',
    );
  });

  it('requires resend credentials when resend is enabled', () => {
    expect(() =>
      validateEnv({
        ...createBaseEnv(),
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM: 'MenteAmiga <security@menteamiga.test>',
      }),
    ).toThrow('Missing required environment variable: RESEND_API_KEY');
  });
});
