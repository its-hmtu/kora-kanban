import { randomUUID } from 'node:crypto';
import { Controller, Get, Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Response } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator';
import { APP_CONFIG } from '../../src/infra/config/config.module';
import type { Env } from '../../src/infra/config/env';
import type { PrismaService } from '../../src/infra/prisma/prisma.service';
import type { AuthUser } from '../../src/modules/auth/auth.types';
import {
  OAuthCodeRejectedError,
  OAuthProviderClient,
  type OAuthProfile,
  type OAuthProvider,
} from '../../src/modules/auth/oauth/oauth-provider.client';
import { CLOCK, type Clock } from '../../src/modules/auth/session.service';
import { createUser } from '../setup/factories';
import { agentFor, closeHarness, createTestApp, getPrisma, resetDb } from '../setup/test-app';

/** A signed-in-only probe: 200 with the user id, or 401 when the session is not valid. */
@Controller('t')
class ProbeController {
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id };
  }
}

interface Grant {
  provider: OAuthProvider;
  codeVerifier?: string;
  profile: OAuthProfile;
}

/**
 * Stands in for Google/GitHub at the OAuthProviderClient boundary. Like a real provider, a code
 * is bound to the authorization request it answers (including its PKCE verifier) and is single
 * use.
 */
class FakeProviders implements Pick<
  OAuthProviderClient,
  'isEnabled' | 'usesPkce' | 'createAuthorizationUrl' | 'fetchProfile'
> {
  enabled = new Set<OAuthProvider>(['google', 'github']);
  failProfileFetch = false;
  /** Code exchanges attempted; a callback that fails the cookie/state checks must not make one. */
  exchanges = 0;
  private readonly requests = new Map<string, { provider: OAuthProvider; codeVerifier?: string }>();
  private readonly codes = new Map<string, Grant>();

  isEnabled(provider: OAuthProvider): boolean {
    return this.enabled.has(provider);
  }

  usesPkce(provider: OAuthProvider): boolean {
    return provider === 'google';
  }

  createAuthorizationUrl(provider: OAuthProvider, state: string, codeVerifier?: string): URL {
    this.requests.set(state, { provider, codeVerifier });
    const url = new URL(`https://${provider}.provider.test/authorize`);
    url.searchParams.set('state', state);
    return url;
  }

  /** The user approves the authorization request identified by `state`; returns its code. */
  approve(state: string, profile: OAuthProfile): string {
    const req = this.requests.get(state);
    if (!req) throw new Error(`no authorization request for state ${state}`);
    const code = randomUUID();
    this.codes.set(code, { ...req, profile });
    return code;
  }

  fetchProfile(
    provider: OAuthProvider,
    code: string,
    codeVerifier?: string,
  ): Promise<OAuthProfile> {
    this.exchanges++;
    const grant = this.codes.get(code);
    this.codes.delete(code);
    if (this.failProfileFetch) return Promise.reject(new Error('provider API is down'));
    if (!grant || grant.provider !== provider || grant.codeVerifier !== codeVerifier) {
      return Promise.reject(new OAuthCodeRejectedError('invalid_grant'));
    }
    return Promise.resolve(grant.profile);
  }
}

const API = '/api/v1';
const MINUTE = 60_000;

const providers = new FakeProviders();
let clockOffset = 0;
const clock: Clock = { now: () => new Date(Date.now() + clockOffset) };

let app: NestExpressApplication;
let prisma: PrismaService;
let appUrl: string;

beforeAll(async () => {
  app = await createTestApp({
    controllers: [ProbeController],
    overrides: [
      { provide: OAuthProviderClient, useValue: providers },
      { provide: CLOCK, useValue: clock },
    ],
  });
  prisma = await getPrisma();
  appUrl = app.get<Env>(APP_CONFIG).APP_URL.replace(/\/+$/, '');
});
beforeEach(async () => {
  clockOffset = 0;
  providers.enabled = new Set(['google', 'github']);
  providers.failProfileFetch = false;
  providers.exchanges = 0;
  await resetDb();
});
afterAll(closeHarness);

function setCookies(res: Response, name: string): string[] {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).filter((c) => c.startsWith(`${name}=`));
}
function cookieValue(res: Response, name: string): string | undefined {
  return setCookies(res, name)[0]
    ?.split(';')[0]!
    .slice(name.length + 1);
}
function expectOAuthCookieCleared(res: Response): void {
  const [cleared] = setCookies(res, 'kora_oauth');
  expect(cleared).toMatch(/^kora_oauth=;/);
  expect(cleared).toContain('Path=/api/v1/auth/oauth');
  expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
}

const profile = (overrides: Partial<OAuthProfile> = {}): OAuthProfile => ({
  providerUserId: randomUUID(),
  email: `oauth.${randomUUID().slice(0, 8)}@example.com`,
  emailVerified: true,
  name: 'Ada Lovelace',
  ...overrides,
});

/** Starts the flow in `agent` (a browser) and returns the state the provider received. */
async function start(agent: request.Agent, provider: OAuthProvider, next?: string) {
  const res = await agent
    .get(`${API}/auth/oauth/${provider}`)
    .query(next === undefined ? {} : { next })
    .expect(302);
  const state = new URL(res.headers.location as string).searchParams.get('state');
  if (!state) throw new Error('no state in provider redirect');
  return { res, state };
}

const callback = (agent: request.Agent, provider: OAuthProvider, query: Record<string, string>) =>
  agent.get(`${API}/auth/oauth/${provider}/callback`).query(query);

/** A full successful-looking round trip: start, the user approves, the provider calls back. */
async function signInWith(provider: OAuthProvider, p: OAuthProfile, next?: string) {
  const agent = request.agent(app.getHttpServer());
  const { state } = await start(agent, provider, next);
  const code = providers.approve(state, p);
  const res = await callback(agent, provider, { code, state });
  return { agent, res };
}

const whoAmI = (agent: request.Agent) => agent.get(`${API}/t/me`);

describe('GET /auth/oauth/:provider', () => {
  it('redirects to the provider and stores the flow in a signed, short-lived kora_oauth cookie', async () => {
    const agent = request.agent(app.getHttpServer());
    const { res, state } = await start(agent, 'google');
    expect(res.headers.location).toMatch(/^https:\/\/google\.provider\.test\/authorize\?/);
    expect(state.length).toBeGreaterThanOrEqual(32);
    const [cookie] = setCookies(res, 'kora_oauth');
    expect(cookie).toContain('Path=/api/v1/auth/oauth');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('uses a fresh state for every flow', async () => {
    const a = await start(request.agent(app.getHttpServer()), 'github');
    const b = await start(request.agent(app.getHttpServer()), 'github');
    expect(a.state).not.toBe(b.state);
  });

  it('redirects to the login page for an unknown provider or one without configured credentials', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = `${appUrl}/login?error=oauth_failed`;
    const unknown = await agent.get(`${API}/auth/oauth/twitter`).expect(302);
    expect(unknown.headers.location).toBe(login);
    expect(unknown.body).toEqual({});
    providers.enabled.delete('github');
    const disabled = await agent.get(`${API}/auth/oauth/github`).expect(302);
    expect(disabled.headers.location).toBe(login);
    expect(setCookies(disabled, 'kora_oauth')).toEqual([]);
    const cb = await agent.get(`${API}/auth/oauth/github/callback?code=x&state=y`).expect(302);
    expect(cb.headers.location).toBe(login);
  });
});

describe('GET /auth/oauth/providers', () => {
  it('lists only the configured providers, publicly (no session, no CSRF)', async () => {
    const agent = request.agent(app.getHttpServer());
    const both = await agent.get(`${API}/auth/oauth/providers`).expect(200);
    expect(both.body).toEqual({ providers: ['google', 'github'] });

    providers.enabled.delete('github');
    const one = await agent.get(`${API}/auth/oauth/providers`).expect(200);
    expect(one.body).toEqual({ providers: ['google'] });

    providers.enabled.clear();
    const none = await agent.get(`${API}/auth/oauth/providers`).expect(200);
    expect(none.body).toEqual({ providers: [] });
  });
});

describe('GET /auth/oauth/:provider/callback — sign-in and linking', () => {
  it('first Google login creates a verified, password-less user and signs them in', async () => {
    const p = profile({ name: 'Grace Hopper' });
    const { agent, res } = await signInWith('google', p);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${appUrl}/`);
    expect(cookieValue(res, 'kora_sid')).toBeTruthy();
    expect(cookieValue(res, 'kora_csrf')).toBeTruthy();
    expectOAuthCookieCleared(res);

    const users = await prisma.client.user.findMany({ include: { oauthAccounts: true } });
    expect(users).toHaveLength(1);
    const [user] = users;
    expect(user).toMatchObject({ email: p.email, name: 'Grace Hopper', passwordHash: null });
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(user!.oauthAccounts).toEqual([
      expect.objectContaining({
        provider: 'google',
        providerUserId: p.providerUserId,
        email: p.email,
        emailVerified: true,
      }),
    ]);
    expect((await whoAmI(agent).expect(200)).body).toEqual({ id: user!.id });
  });

  it('names a new user after the email local part when the provider gives no name', async () => {
    const local = 'x'.repeat(120);
    await signInWith('github', profile({ name: null, email: `${local}@example.com` }));
    const user = await prisma.client.user.findFirstOrThrow();
    expect(user.name).toBe('x'.repeat(100));
  });

  it('a returning OAuth user signs in to the same account', async () => {
    const p = profile();
    await signInWith('google', p);
    const { agent, res } = await signInWith('google', p);
    expect(res.headers.location).toBe(`${appUrl}/`);
    expect(await prisma.client.user.count()).toBe(1);
    expect(await prisma.client.oAuthAccount.count()).toBe(1);
    await whoAmI(agent).expect(200);
  });

  it('GitHub with a verified email matching a verified password account links it and creates no user (FR-003)', async () => {
    const existing = await createUser({ passwordHash: 'argon2-hash' });
    const otherDevice = await agentFor(existing);
    const p = profile({ email: existing.email.toUpperCase() });

    const { agent, res } = await signInWith('github', p);

    expect(res.headers.location).toBe(`${appUrl}/`);
    expect(await prisma.client.user.count()).toBe(1);
    const account = await prisma.client.oAuthAccount.findFirstOrThrow();
    expect(account).toMatchObject({
      userId: existing.id,
      provider: 'github',
      providerUserId: p.providerUserId,
      emailVerified: true,
    });
    const after = await prisma.client.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.passwordHash).toBe('argon2-hash');
    expect(after.emailVerifiedAt).toEqual(existing.emailVerifiedAt);
    expect((await whoAmI(agent).expect(200)).body).toEqual({ id: existing.id });
    await whoAmI(otherDevice).expect(200); // a verified owner's other sessions are kept
  });

  it('a verified provider email matching an UNVERIFIED account takes it over safely (pre-account-takeover defence)', async () => {
    // Someone registered the victim's email with a password but never verified it.
    const squatter = await createUser({ emailVerifiedAt: null, passwordHash: 'attacker-hash' });
    const squatterSession = await agentFor(squatter);

    const { agent, res } = await signInWith('github', profile({ email: squatter.email }));

    expect(res.headers.location).toBe(`${appUrl}/`);
    expect(await prisma.client.user.count()).toBe(1);
    const user = await prisma.client.user.findUniqueOrThrow({ where: { id: squatter.id } });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await prisma.client.oAuthAccount.count({ where: { userId: squatter.id } })).toBe(1);
    await whoAmI(squatterSession).expect(401);
    await whoAmI(agent).expect(200);
    expect(await prisma.client.session.count({ where: { userId: squatter.id } })).toBe(1);
  });

  it('an unverified provider email is not auto-linked and signs nobody in', async () => {
    const existing = await createUser({ passwordHash: 'argon2-hash' });
    const { res } = await signInWith(
      'github',
      profile({ email: existing.email, emailVerified: false }),
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${appUrl}/login?error=oauth_email_unverified`);
    expect(setCookies(res, 'kora_sid')).toEqual([]);
    expectOAuthCookieCleared(res);
    expect(await prisma.client.oAuthAccount.count()).toBe(0);
    expect(await prisma.client.session.count()).toBe(0);
    const after = await prisma.client.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.passwordHash).toBe('argon2-hash');
  });

  it('an unverified or missing provider email never creates a user', async () => {
    const a = await signInWith('google', profile({ emailVerified: false }));
    const b = await signInWith('github', profile({ email: null, emailVerified: false }));
    for (const { res } of [a, b]) {
      expect(res.headers.location).toBe(`${appUrl}/login?error=oauth_email_unverified`);
    }
    expect(await prisma.client.user.count()).toBe(0);
  });

  it('an already-linked account signs in even if the provider now reports the email unverified', async () => {
    const p = profile();
    await signInWith('github', p);
    const { agent, res } = await signInWith('github', { ...p, emailVerified: false });
    expect(res.headers.location).toBe(`${appUrl}/`);
    await whoAmI(agent).expect(200);
  });

  it('never signs in a soft-deleted user, whether linked or matched by email', async () => {
    const p = profile();
    await signInWith('google', p);
    await prisma.client.user.updateMany({ data: { deletedAt: new Date() } });
    await prisma.client.session.deleteMany();
    const linked = await signInWith('google', p);
    expect(linked.res.headers.location).toBe(`${appUrl}/login?error=oauth_failed`);

    const deleted = await createUser({ deletedAt: new Date() });
    const byEmail = await signInWith('github', profile({ email: deleted.email }));
    expect(byEmail.res.headers.location).toBe(`${appUrl}/login?error=oauth_failed`);
    expect(await prisma.client.oAuthAccount.count({ where: { userId: deleted.id } })).toBe(0);
    expect(await prisma.client.session.count()).toBe(0);
  });

  it('after account deletion the same provider account and email start a brand-new user', async () => {
    const p = profile();
    const first = await signInWith('google', p);
    const oldUser = await prisma.client.user.findUniqueOrThrow({ where: { email: p.email! } });
    const token = cookieValue(first.res, 'kora_csrf')!;
    await first.agent
      .delete(`${API}/me`)
      .set('Origin', appUrl)
      .set('X-CSRF-Token', token)
      .expect(204);

    const second = await signInWith('google', p);
    expect(second.res.headers.location).toBe(`${appUrl}/`);
    const created = await prisma.client.user.findUniqueOrThrow({ where: { email: p.email! } });
    expect(created.id).not.toBe(oldUser.id);
    expect(created.deletedAt).toBeNull();
    expect(
      await prisma.client.oAuthAccount.findMany({ where: { provider: 'google' } }),
    ).toMatchObject([{ userId: created.id }]);
    expect((await whoAmI(second.agent)).body).toEqual({ id: created.id });
  });

  it('concurrent first logins for the same provider account end with one user', async () => {
    const p = profile();
    const results = await Promise.all([signInWith('google', p), signInWith('google', p)]);
    for (const { res } of results) expect(res.headers.location).toBe(`${appUrl}/`);
    expect(await prisma.client.user.count()).toBe(1);
    expect(await prisma.client.oAuthAccount.count()).toBe(1);
  });

  it('redirects to a safe `next` path and ignores an unsafe one', async () => {
    const safe = await signInWith('google', profile(), '/b/123?card=9');
    expect(safe.res.headers.location).toBe(`${appUrl}/b/123?card=9`);
    for (const next of ['//evil.example/', '/\\evil.example', 'https://evil.example/']) {
      const unsafe = await signInWith('google', profile(), next);
      expect(unsafe.res.headers.location).toBe(`${appUrl}/`);
    }
  });

  it('replaces the session the browser already had', async () => {
    const p = profile();
    const { agent } = await signInWith('google', p);
    const before = await prisma.client.session.findFirstOrThrow();
    const { state } = await start(agent, 'google');
    await callback(agent, 'google', { code: providers.approve(state, p), state }).expect(302);
    const sessions = await prisma.client.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).not.toBe(before.id);
  });
});

describe('GET /auth/oauth/:provider/callback — rejected flows', () => {
  /** Every failure is a browser redirect to the login page: never JSON, never a session. */
  const expectLoginRedirect = (res: Response, error = 'oauth_failed') => {
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${appUrl}/login?error=${error}`);
    expect(res.body).toEqual({});
    expectOAuthCookieCleared(res);
    expect(setCookies(res, 'kora_sid')).toEqual([]);
    expect(setCookies(res, 'kora_csrf')).toEqual([]);
  };

  it('a state mismatch → login redirect and nothing is created', async () => {
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent, 'google');
    const code = providers.approve(state, profile());
    const res = await callback(agent, 'google', { code, state: 'forged-state' });
    expectLoginRedirect(res);
    expect(providers.exchanges).toBe(0);
    expect(await prisma.client.user.count()).toBe(0);
  });

  it('a PKCE mismatch (a code issued to another flow) → login redirect', async () => {
    const victim = request.agent(app.getHttpServer());
    const { state: victimState } = await start(victim, 'google');
    const attacker = request.agent(app.getHttpServer());
    const { state: attackerState } = await start(attacker, 'google');
    const injectedCode = providers.approve(attackerState, profile());

    const res = await callback(victim, 'google', { code: injectedCode, state: victimState });
    expectLoginRedirect(res);
    expect(await prisma.client.user.count()).toBe(0);
  });

  it('a missing, forged, expired or other-provider kora_oauth cookie → login redirect', async () => {
    const fresh = request.agent(app.getHttpServer());
    expectLoginRedirect(await callback(fresh, 'google', { code: 'c', state: 's' }));

    const forged = request.agent(app.getHttpServer());
    const { state } = await start(forged, 'github');
    const forgedRes = await request(app.getHttpServer())
      .get(`${API}/auth/oauth/github/callback`)
      .query({ code: providers.approve(state, profile()), state })
      .set(
        'Cookie',
        `kora_oauth=${Buffer.from(JSON.stringify({ state })).toString('base64url')}.AAAA`,
      );
    expectLoginRedirect(forgedRes);

    const late = request.agent(app.getHttpServer());
    const lateFlow = await start(late, 'github');
    clockOffset = 11 * MINUTE;
    expectLoginRedirect(
      await callback(late, 'github', {
        code: providers.approve(lateFlow.state, profile()),
        state: lateFlow.state,
      }),
    );
    clockOffset = 0;

    const crossed = request.agent(app.getHttpServer());
    const ghFlow = await start(crossed, 'github');
    expectLoginRedirect(
      await callback(crossed, 'google', {
        code: providers.approve(ghFlow.state, profile()),
        state: ghFlow.state,
      }),
    );
    expect(providers.exchanges).toBe(0); // all rejected before the code was ever used
    expect(await prisma.client.user.count()).toBe(0);
  });

  it('a replayed callback → login redirect (the cookie is single-use)', async () => {
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent, 'github');
    const code = providers.approve(state, profile());
    await callback(agent, 'github', { code, state }).expect(302);
    expectLoginRedirect(await callback(agent, 'github', { code, state }));
  });

  it('a missing or repeated code/state parameter → login redirect', async () => {
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent, 'github');
    expectLoginRedirect(await callback(agent, 'github', { state }));
    const again = request.agent(app.getHttpServer());
    const flow = await start(again, 'github');
    expectLoginRedirect(
      await again.get(
        `${API}/auth/oauth/github/callback?state=${flow.state}&state=${flow.state}&code=x`,
      ),
    );
  });

  it('a provider error (user denied) redirects to the login page with oauth_failed', async () => {
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent, 'google');
    const res = await callback(agent, 'google', { error: 'access_denied', state }).expect(302);
    expect(res.headers.location).toBe(`${appUrl}/login?error=oauth_failed`);
    expectOAuthCookieCleared(res);
  });

  it('logs the provider and the provider error code when the code is rejected', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const agent = request.agent(app.getHttpServer());
    const { state } = await start(agent, 'github');
    expectLoginRedirect(await callback(agent, 'github', { code: 'never-issued', state }));
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/github.*invalid_grant/));
  });

  it('a provider API failure after the code exchange redirects with oauth_failed', async () => {
    providers.failProfileFetch = true;
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { res } = await signInWith('github', profile());
    expect(warn).toHaveBeenCalledWith('github sign-in failed: provider API is down');
    warn.mockRestore();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${appUrl}/login?error=oauth_failed`);
    expect(await prisma.client.user.count()).toBe(0);
  });
});
