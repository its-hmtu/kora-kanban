import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../infra/config/env';
import type { CryptoService } from '../../infra/crypto/crypto.service';
import { CsrfController } from './csrf.controller';

const crypto = { randomToken: () => 'tok' } as unknown as CryptoService;
const controllerFor = (NODE_ENV: Env['NODE_ENV']) =>
  new CsrfController(crypto, { NODE_ENV } as Env);

function fakeResponse() {
  const calls: unknown[][] = [];
  const res = { cookie: (...args: unknown[]) => calls.push(args) } as unknown as Response;
  return { res, calls };
}

describe('CsrfController cookie', () => {
  it('production: kora_csrf is Secure, readable by JS, SameSite=Lax, Path=/, 30 days', () => {
    const { res, calls } = fakeResponse();
    expect(controllerFor('production').csrf(res)).toEqual({ csrfToken: 'tok' });
    expect(calls).toEqual([
      [
        'kora_csrf',
        'tok',
        {
          httpOnly: false,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 30 * 24 * 3600 * 1000,
        },
      ],
    ]);
  });

  it('development: not Secure (plain http localhost)', () => {
    const { res, calls } = fakeResponse();
    controllerFor('development').csrf(res);
    expect((calls[0]![2] as { secure: boolean }).secure).toBe(false);
  });
});
