import { Inject, Injectable } from '@nestjs/common';
import { decodeIdToken, GitHub, Google, OAuth2RequestError, type OAuth2Tokens } from 'arctic';
import { APP_CONFIG } from '../../../infra/config/config.module';
import type { Env } from '../../../infra/config/env';

export const OAUTH_PROVIDERS = ['google', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** What the sign-in flow needs from a provider; `email` is trimmed and lower-cased. */
export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  /** True only when the provider itself says it verified `email`. */
  emailVerified: boolean;
  name: string | null;
}

/** The provider refused the authorization code (bad/used/expired code or PKCE mismatch). */
export class OAuthCodeRejectedError extends Error {
  constructor(readonly providerCode: string) {
    super(`OAuth code rejected: ${providerCode}`);
    this.name = 'OAuthCodeRejectedError';
  }
}

const GOOGLE_SCOPES = ['openid', 'email', 'profile'];
const GITHUB_SCOPES = ['read:user', 'user:email'];
const GITHUB_API = 'https://api.github.com';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
}
interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

const normalizeEmail = (email: unknown): string | null =>
  typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null;
const nonEmpty = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/**
 * The only code that talks to Google/GitHub (arctic + profile APIs), kept behind one injectable
 * so tests replace it at this boundary. A provider is enabled only when its client id and secret
 * are both configured.
 */
@Injectable()
export class OAuthProviderClient {
  private readonly google: Google | null;
  private readonly github: GitHub | null;

  constructor(@Inject(APP_CONFIG) config: Env) {
    const callback = (p: OAuthProvider) =>
      `${config.API_URL.replace(/\/+$/, '')}/api/v1/auth/oauth/${p}/callback`;
    this.google =
      config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? new Google(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, callback('google'))
        : null;
    this.github =
      config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET
        ? new GitHub(config.GITHUB_CLIENT_ID, config.GITHUB_CLIENT_SECRET, callback('github'))
        : null;
  }

  isEnabled(provider: OAuthProvider): boolean {
    return (provider === 'google' ? this.google : this.github) !== null;
  }

  /** Google supports PKCE through arctic; arctic's GitHub client does not. */
  usesPkce(provider: OAuthProvider): boolean {
    return provider === 'google';
  }

  createAuthorizationUrl(provider: OAuthProvider, state: string, codeVerifier?: string): URL {
    if (provider === 'google') {
      if (!codeVerifier) throw new Error('Google sign-in requires a PKCE code verifier');
      return this.googleClient().createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
    }
    return this.githubClient().createAuthorizationURL(state, GITHUB_SCOPES);
  }

  /** Exchanges the code and reads the profile; throws OAuthCodeRejectedError if it was refused. */
  async fetchProfile(
    provider: OAuthProvider,
    code: string,
    codeVerifier?: string,
  ): Promise<OAuthProfile> {
    if (provider === 'google') {
      if (!codeVerifier) throw new OAuthCodeRejectedError('missing_code_verifier');
      const tokens = await exchange(() =>
        this.googleClient().validateAuthorizationCode(code, codeVerifier),
      );
      return googleProfile(tokens);
    }
    const tokens = await exchange(() => this.githubClient().validateAuthorizationCode(code));
    return githubProfile(tokens.accessToken());
  }

  private googleClient(): Google {
    if (!this.google) throw new Error('Google sign-in is not configured');
    return this.google;
  }

  private githubClient(): GitHub {
    if (!this.github) throw new Error('GitHub sign-in is not configured');
    return this.github;
  }
}

async function exchange(run: () => Promise<OAuth2Tokens>): Promise<OAuth2Tokens> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OAuth2RequestError) throw new OAuthCodeRejectedError(error.code);
    throw error;
  }
}

/**
 * The ID token comes straight from Google's token endpoint over TLS, so its claims are trusted
 * without verifying the signature (OIDC Core 3.1.3.7).
 */
function googleProfile(tokens: OAuth2Tokens): OAuthProfile {
  const claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
  if (typeof claims.sub !== 'string' || claims.sub === '') {
    throw new Error('Google ID token has no subject');
  }
  return {
    providerUserId: claims.sub,
    email: normalizeEmail(claims.email),
    emailVerified: claims.email_verified === true,
    name: nonEmpty(claims.name),
  };
}

/** Profile from `/user`; email is the primary one from `/user/emails` (never a secondary one). */
async function githubProfile(accessToken: string): Promise<OAuthProfile> {
  const user = await githubGet<GitHubUser>('/user', accessToken);
  if (typeof user.id !== 'number') throw new Error('GitHub user has no id');
  const emails = await githubGet<GitHubEmail[]>('/user/emails', accessToken);
  const primary = Array.isArray(emails) ? emails.find((e) => e.primary === true) : undefined;
  return {
    providerUserId: String(user.id),
    email: normalizeEmail(primary?.email),
    emailVerified: primary?.verified === true,
    name: nonEmpty(user.name) ?? nonEmpty(user.login),
  };
}

async function githubGet<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'kora',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${path} responded ${res.status}`);
  return (await res.json()) as T;
}
