import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../infra/config/env';
import type { CryptoService } from '../../infra/crypto/crypto.service';
import { CsrfController } from './csrf.controller';
import { CsrfTokenService } from './csrf-token.service';

const crypto = { randomToken: () => 'tok' } as unknown as CryptoService;
const serviceFor = (NODE_ENV: Env['NODE_ENV']) => new CsrfTokenService(crypto, { NODE_ENV } as Env);

function fakeResponse() {
  const calls: unknown[][] = [];
  const res = {
    cookie: (...args: unknown[]) => calls.push(['cookie', ...args]),
    clearCookie: (...args: unknown[]) => calls.push(['clearCookie', ...args]),
  } as unknown as Response;
  return { res, calls };
}

const PROD_OPTIONS = { httpOnly: false, secure: true, sameSite: 'lax', path: '/' };

describe('CsrfTokenService', () => {
  it('production: kora_csrf is Secure, readable by JS, SameSite=Lax, Path=/, 30 days', () => {
    const { res, calls } = fakeResponse();
    expect(serviceFor('production').issue(res)).toBe('tok');
    expect(calls).toEqual([
      ['cookie', 'kora_csrf', 'tok', { ...PROD_OPTIONS, maxAge: 30 * 24 * 3600 * 1000 }],
    ]);
  });

  it('development: not Secure (plain http localhost)', () => {
    const { res, calls } = fakeResponse();
    serviceFor('development').issue(res);
    expect((calls[0]![3] as { secure: boolean }).secure).toBe(false);
  });

  it('clear: expires kora_csrf with the same attributes', () => {
    const { res, calls } = fakeResponse();
    serviceFor('production').clear(res);
    expect(calls).toEqual([['clearCookie', 'kora_csrf', PROD_OPTIONS]]);
  });
});

describe('CsrfController', () => {
  it('GET /auth/csrf issues the cookie and returns the token', () => {
    const { res, calls } = fakeResponse();
    expect(new CsrfController(serviceFor('production')).csrf(res)).toEqual({ csrfToken: 'tok' });
    expect(calls).toHaveLength(1);
  });
});
