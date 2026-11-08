import { describe, expect, it } from 'vitest';

import { parseEnv, siteNoindex } from '../src/env';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://ota:ota@localhost:5432/ota_dev',
  AUTH_SECRET: 'a'.repeat(32),
};

describe('parseEnv', () => {
  it('applies defaults for optional values', () => {
    const env = parseEnv(validEnv);

    expect(env.PORT).toBe(3001);
    expect(env.TENANT_ID).toBe('vereda-expeditions');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.S3_BUCKET).toBe('ota-documents');
  });

  it('rejects a missing AUTH_SECRET', () => {
    const { AUTH_SECRET: _omit, ...withoutSecret } = validEnv;

    expect(() => parseEnv(withoutSecret)).toThrowError(/AUTH_SECRET/);
  });

  it('rejects a non-URL DATABASE_URL', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'not-a-url' })).toThrowError(
      /DATABASE_URL/,
    );
  });
});

describe('siteNoindex', () => {
  it('is on only when the flag says so', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'on']) {
      expect(siteNoindex(value)).toBe(true);
    }
    for (const value of [undefined, '', '0', 'false', 'off', 'no', 'noindex']) {
      expect(siteNoindex(value)).toBe(false);
    }
  });
});
