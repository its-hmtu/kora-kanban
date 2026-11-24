import { describe, expect, it } from 'vitest';
import {
  openOAuthCookie,
  safeNextPath,
  sealOAuthCookie,
  type OAuthCookiePayload,
} from './oauth-cookie';

const SECRET = 'test-session-secret-test-session-secret';
const NOW = new Date('2026-11-24T10:00:00Z');
const payload: OAuthCookiePayload = {
  provider: 'google',
  state: 'state-123',
  codeVerifier: 'verifier-456',
  next: '/b/abc',
  exp: NOW.getTime() + 60_000,
};

describe('sealOAuthCookie / openOAuthCookie', () => {
  it('round-trips a payload signed with the same secret', () => {
    expect(openOAuthCookie(sealOAuthCookie(payload, SECRET), SECRET, NOW)).toEqual(payload);
  });

  it('rejects a cookie signed with another secret', () => {
    const sealed = sealOAuthCookie(payload, 'another-secret-another-secret-another');
    expect(openOAuthCookie(sealed, SECRET, NOW)).toBeNull();
  });

  it('rejects a tampered payload', () => {
    const [, signature] = sealOAuthCookie(payload, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, state: 'attacker' })).toString(
      'base64url',
    );
    expect(openOAuthCookie(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it('rejects an expired cookie', () => {
    const sealed = sealOAuthCookie(payload, SECRET);
    expect(openOAuthCookie(sealed, SECRET, new Date(payload.exp))).toBeNull();
  });

  it('rejects missing, malformed and wrongly shaped values', () => {
    expect(openOAuthCookie(undefined, SECRET, NOW)).toBeNull();
    expect(openOAuthCookie('', SECRET, NOW)).toBeNull();
    expect(openOAuthCookie('no-signature', SECRET, NOW)).toBeNull();
    expect(openOAuthCookie(['a', 'b'], SECRET, NOW)).toBeNull();
    const wrongShape = { ...payload, provider: 'twitter' } as unknown as OAuthCookiePayload;
    expect(openOAuthCookie(sealOAuthCookie(wrongShape, SECRET), SECRET, NOW)).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('accepts a same-origin path', () => {
    expect(safeNextPath('/')).toBe('/');
    expect(safeNextPath('/b/abc?card=1#c')).toBe('/b/abc?card=1#c');
  });

  it.each([
    ['missing', undefined],
    ['non-string', ['/a', '/b']],
    ['absolute URL', 'https://evil.example/'],
    ['protocol-relative', '//evil.example/'],
    ['backslash protocol-relative', '/\\evil.example/'],
    ['relative path', 'b/abc'],
    ['control character', '/\t/evil.example'],
    ['empty', ''],
  ])('ignores a %s value', (_label, value) => {
    expect(safeNextPath(value)).toBeUndefined();
  });
});
