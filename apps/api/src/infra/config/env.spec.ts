import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const KEY = Buffer.alloc(32, 7).toString('base64');
const valid = {
  DATABASE_URL: 'postgresql://kora:kora@localhost:5432/kora',
  REDIS_URL: 'redis://localhost:6379',
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:3000',
  SESSION_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY: KEY,
  MAIL_FROM: 'Kora <noreply@kora.local>',
};

describe('loadEnv', () => {
  it('parses a minimal valid env and applies defaults', () => {
    const env = loadEnv(valid);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.SMTP_URL).toBe('smtp://localhost:1025');
  });

  it('defaults TRUST_PROXY to 0 and accepts non-negative integers only', () => {
    expect(loadEnv(valid).TRUST_PROXY).toBe(0);
    expect(loadEnv({ ...valid, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    for (const bad of ['-1', '1.5', 'abc']) {
      expect(() => loadEnv({ ...valid, TRUST_PROXY: bad })).toThrow(/TRUST_PROXY/);
    }
  });

  it('coerces PORT and accepts NODE_ENV values', () => {
    const env = loadEnv({ ...valid, PORT: '4000', NODE_ENV: 'production' });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('production');
  });

  it('treats empty strings as undefined (optional vars and defaults)', () => {
    const env = loadEnv({ ...valid, RESEND_API_KEY: '', R2_BUCKET: '', PORT: '', SMTP_URL: '' });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.R2_BUCKET).toBeUndefined();
    expect(env.PORT).toBe(3000);
    expect(env.SMTP_URL).toBe('smtp://localhost:1025');
  });

  it('fails for empty required vars, listing every invalid name but no values', () => {
    const bad = {
      ...valid,
      SESSION_SECRET: 'short-secret-value',
      APP_URL: 'not a url',
      DATABASE_URL: '',
    };
    let message = '';
    try {
      loadEnv(bad);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('SESSION_SECRET');
    expect(message).toContain('APP_URL');
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('short-secret-value');
    expect(message).not.toContain('not a url');
  });

  it('rejects ENCRYPTION_KEY that is not 32 bytes of base64', () => {
    expect(() =>
      loadEnv({ ...valid, ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/ENCRYPTION_KEY/);
    expect(() => loadEnv({ ...valid, ENCRYPTION_KEY: '' })).toThrow(/ENCRYPTION_KEY/);
  });

  it('rejects ENCRYPTION_KEY that is not strict base64 even if it decodes to 32 bytes', () => {
    // Node's lenient decoder skips invalid characters, so these would decode to 32 bytes.
    expect(() => loadEnv({ ...valid, ENCRYPTION_KEY: `${KEY}!!` })).toThrow(/ENCRYPTION_KEY/);
    expect(() => loadEnv({ ...valid, ENCRYPTION_KEY: ` ${KEY}` })).toThrow(/ENCRYPTION_KEY/);
    const urlSafe = Buffer.alloc(32, 0xfb).toString('base64url');
    expect(() => loadEnv({ ...valid, ENCRYPTION_KEY: urlSafe })).toThrow(/ENCRYPTION_KEY/);
  });

  it('rejects invalid NODE_ENV and PORT', () => {
    expect(() => loadEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects a malformed optional URL (S3_ENDPOINT) when provided', () => {
    expect(() => loadEnv({ ...valid, S3_ENDPOINT: 'nope' })).toThrow(/S3_ENDPOINT/);
  });
});
