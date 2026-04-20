import { StringValue } from 'ms';

export function parseJwtExpiresIn(value?: string): number | StringValue {
  const expiresIn = value?.trim() || '604800';

  if (/^\d+$/.test(expiresIn)) {
    return Number(expiresIn);
  }

  if (/^\d+(ms|s|m|h|d|w|y)$/.test(expiresIn)) {
    return expiresIn as StringValue;
  }

  throw new Error(
    'JWT_EXPIRES_IN must be a number of seconds or a duration like 30m, 1h, or 7d',
  );
}
