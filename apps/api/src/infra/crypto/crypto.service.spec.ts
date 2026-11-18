import { beforeEach, describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service';
import type { Env } from '../config/env';

const config = { ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64') } as Env;

describe('CryptoService', () => {
  let svc: CryptoService;
  beforeEach(() => {
    svc = new CryptoService(config);
  });

  it('randomToken: default 32 bytes as base64url, unique', () => {
    const a = svc.randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(a, 'base64url')).toHaveLength(32);
    expect(svc.randomToken()).not.toBe(a);
  });

  it('randomToken: honours byte length', () => {
    expect(Buffer.from(svc.randomToken(16), 'base64url')).toHaveLength(16);
  });

  it('randomToken: rejects fewer than 16 bytes and non-integers', () => {
    expect(() => svc.randomToken(15)).toThrow(/at least 16/);
    expect(() => svc.randomToken(0)).toThrow(/at least 16/);
    expect(() => svc.randomToken(16.5)).toThrow(/integer/);
    expect(() => svc.randomToken(Number.NaN)).toThrow(/integer/);
  });

  it('constructor rejects a key that does not decode to 32 bytes', () => {
    expect(
      () => new CryptoService({ ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') } as Env),
    ).toThrow(/32 bytes/);
  });

  it('sha256: known vector, hex', () => {
    expect(svc.sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('encrypt/decrypt round-trips, format iv.tag.data', () => {
    const ct = svc.encrypt('héllo secret');
    expect(ct.split('.')).toHaveLength(3);
    expect(svc.decrypt(ct)).toBe('héllo secret');
  });

  it('round-trips the empty string', () => {
    expect(svc.decrypt(svc.encrypt(''))).toBe('');
  });

  it('uses a different IV each time', () => {
    const a = svc.encrypt('same');
    const b = svc.encrypt('same');
    expect(a).not.toBe(b);
    expect(a.split('.')[0]).not.toBe(b.split('.')[0]);
  });

  it('detects tampering with tag or data', () => {
    const [iv, tag, data] = svc.encrypt('payload-1234').split('.') as [string, string, string];
    const flip = (s: string) => {
      const buf = Buffer.from(s, 'base64url');
      buf[0] = buf[0]! ^ 1;
      return buf.toString('base64url');
    };
    expect(() => svc.decrypt([iv, flip(tag), data].join('.'))).toThrow();
    expect(() => svc.decrypt([iv, tag, flip(data)].join('.'))).toThrow();
  });

  it('rejects malformed ciphertext and a different key', () => {
    expect(() => svc.decrypt('nope')).toThrow();
    const other = new CryptoService({
      ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    } as Env);
    expect(() => other.decrypt(svc.encrypt('x'))).toThrow();
  });

  it('timingSafeEqual: equal, different, and unequal lengths (no throw)', () => {
    expect(svc.timingSafeEqual('abc', 'abc')).toBe(true);
    expect(svc.timingSafeEqual('abc', 'abd')).toBe(false);
    expect(svc.timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
