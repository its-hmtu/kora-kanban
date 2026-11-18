import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../infra/config/env';
import { SessionService, systemClock } from './session.service';

const svcFor = (NODE_ENV: Env['NODE_ENV']) =>
  new SessionService(null as never, null as never, null as never, { NODE_ENV } as Env, systemClock);

function fakeResponse() {
  const calls: { fn: string; args: unknown[] }[] = [];
  const res = {
    cookie: (...args: unknown[]) => calls.push({ fn: 'cookie', args }),
    clearCookie: (...args: unknown[]) => calls.push({ fn: 'clearCookie', args }),
  } as unknown as Response;
  return { res, calls };
}

describe('session cookie helpers', () => {
  it('production: kora_sid is Secure, HttpOnly, SameSite=Lax, Path=/, 30 days', () => {
    const { res, calls } = fakeResponse();
    svcFor('production').setSessionCookie(res, 'tok');
    expect(calls).toEqual([
      {
        fn: 'cookie',
        args: [
          'kora_sid',
          'tok',
          {
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 3600 * 1000,
          },
        ],
      },
    ]);
  });

  it('development: not Secure (plain http localhost)', () => {
    const { res, calls } = fakeResponse();
    svcFor('development').setSessionCookie(res, 'tok');
    expect((calls[0]!.args[2] as { secure: boolean }).secure).toBe(false);
  });

  it('clearSessionCookie uses the same attributes so the browser matches the cookie', () => {
    const { res, calls } = fakeResponse();
    svcFor('production').clearSessionCookie(res);
    expect(calls).toEqual([
      {
        fn: 'clearCookie',
        args: ['kora_sid', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' }],
      },
    ]);
  });
});
