import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../../infra/config/env';
import { OAuthCodeRejectedError, OAuthProviderClient } from './oauth-provider.client';

const base = {
  DATABASE_URL: 'postgresql://kora:kora@localhost:5432/kora',
  REDIS_URL: 'redis://localhost:6379',
  APP_URL: 'http://localhost:5173',
  API_URL: 'http://localhost:3000',
  SESSION_SECRET: 'x'.repeat(32),
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  MAIL_FROM: 'Kora <noreply@kora.local>',
};
const withProviders = {
  ...base,
  GOOGLE_CLIENT_ID: 'g-id',
  GOOGLE_CLIENT_SECRET: 'g-secret',
  GITHUB_CLIENT_ID: 'gh-id',
  GITHUB_CLIENT_SECRET: 'gh-secret',
};

/** An unsigned JWT is enough: the ID token comes straight from Google's token endpoint over TLS. */
function idToken(claims: Record<string, unknown>): string {
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part(claims)}.c2ln`;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** URL and form body of the n-th fetch call (arctic passes a Request). */
async function call(
  n: number,
): Promise<{ url: string; body: URLSearchParams; auth: string | null }> {
  const [input, init] = fetchMock.mock.calls[n] as [Request | string, RequestInit | undefined];
  const req = input instanceof Request ? input : new Request(input, init);
  return {
    url: req.url,
    body: new URLSearchParams(req.method === 'POST' ? await req.text() : ''),
    auth: req.headers.get('authorization'),
  };
}

describe('OAuthProviderClient', () => {
  it('enables a provider only when both its client id and secret are set', () => {
    const none = new OAuthProviderClient(loadEnv(base));
    expect(none.isEnabled('google')).toBe(false);
    expect(none.isEnabled('github')).toBe(false);
    const onlyId = new OAuthProviderClient(loadEnv({ ...base, GOOGLE_CLIENT_ID: 'g-id' }));
    expect(onlyId.isEnabled('google')).toBe(false);
    const all = new OAuthProviderClient(loadEnv(withProviders));
    expect(all.isEnabled('google')).toBe(true);
    expect(all.isEnabled('github')).toBe(true);
  });

  it('builds a Google authorization URL with PKCE (S256) and OIDC scopes', () => {
    const client = new OAuthProviderClient(loadEnv(withProviders));
    expect(client.usesPkce('google')).toBe(true);
    const url = client.createAuthorizationUrl(
      'google',
      'st',
      'verifier-verifier-verifier-verifier-1234',
    );
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('client_id')).toBe('g-id');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/v1/auth/oauth/google/callback',
    );
  });

  it('builds a GitHub authorization URL with state and the user/email scopes', () => {
    const client = new OAuthProviderClient(loadEnv(withProviders));
    expect(client.usesPkce('github')).toBe(false);
    const url = client.createAuthorizationUrl('github', 'st');
    expect(url.origin).toBe('https://github.com');
    expect(url.searchParams.get('state')).toBe('st');
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/v1/auth/oauth/github/callback',
    );
  });

  it('reads the Google profile from the ID token, sending the code verifier', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: 'at',
        token_type: 'Bearer',
        id_token: idToken({
          sub: 'g-1',
          email: 'Ann@Example.com',
          email_verified: true,
          name: 'Ann',
        }),
      }),
    );
    const client = new OAuthProviderClient(loadEnv(withProviders));
    await expect(client.fetchProfile('google', 'code-1', 'verifier-1')).resolves.toEqual({
      providerUserId: 'g-1',
      email: 'ann@example.com',
      emailVerified: true,
      name: 'Ann',
    });
    const token = await call(0);
    expect(token.url).toBe('https://oauth2.googleapis.com/token');
    expect(token.body.get('code')).toBe('code-1');
    expect(token.body.get('code_verifier')).toBe('verifier-1');
  });

  it('treats a missing Google email_verified claim as unverified', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: 'at',
        token_type: 'Bearer',
        id_token: idToken({ sub: 'g-2', email: 'b@example.com' }),
      }),
    );
    const client = new OAuthProviderClient(loadEnv(withProviders));
    const profile = await client.fetchProfile('google', 'code', 'verifier');
    expect(profile).toMatchObject({ email: 'b@example.com', emailVerified: false, name: null });
  });

  it('uses the primary verified GitHub email from /user/emails', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'gh-at', token_type: 'bearer', scope: '' }))
      .mockResolvedValueOnce(
        json({ id: 42, login: 'octo', name: null, email: 'public@example.com' }),
      )
      .mockResolvedValueOnce(
        json([
          { email: 'other@example.com', primary: false, verified: true },
          { email: 'Octo@Example.com', primary: true, verified: true },
        ]),
      );
    const client = new OAuthProviderClient(loadEnv(withProviders));
    await expect(client.fetchProfile('github', 'code-2')).resolves.toEqual({
      providerUserId: '42',
      email: 'octo@example.com',
      emailVerified: true,
      name: 'octo',
    });
    expect((await call(1)).url).toBe('https://api.github.com/user');
    expect((await call(1)).auth).toBe('Bearer gh-at');
    expect((await call(2)).url).toBe('https://api.github.com/user/emails');
  });

  it('reports an unverified primary GitHub email as unverified (never a secondary one)', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'gh-at', token_type: 'bearer', scope: '' }))
      .mockResolvedValueOnce(json({ id: 7, login: 'x', name: 'X' }))
      .mockResolvedValueOnce(
        json([
          { email: 'verified@example.com', primary: false, verified: true },
          { email: 'primary@example.com', primary: true, verified: false },
        ]),
      );
    const client = new OAuthProviderClient(loadEnv(withProviders));
    const profile = await client.fetchProfile('github', 'code');
    expect(profile).toMatchObject({
      email: 'primary@example.com',
      emailVerified: false,
      name: 'X',
    });
  });

  it('throws OAuthCodeRejectedError when the provider rejects the code', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));
    const client = new OAuthProviderClient(loadEnv(withProviders));
    await expect(client.fetchProfile('google', 'bad', 'verifier')).rejects.toBeInstanceOf(
      OAuthCodeRejectedError,
    );
  });

  it('fails (not OAuthCodeRejectedError) when the GitHub API errors', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ access_token: 'gh-at', token_type: 'bearer', scope: '' }))
      .mockResolvedValueOnce(json({ message: 'boom' }, 502));
    const client = new OAuthProviderClient(loadEnv(withProviders));
    const error = await client.fetchProfile('github', 'code').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(OAuthCodeRejectedError);
  });
});
