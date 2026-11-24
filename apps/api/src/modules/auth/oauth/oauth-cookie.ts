import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { OAUTH_PROVIDERS, type OAuthProvider } from './oauth-provider.client';

/** Holds the in-flight OAuth flow (research B2) between the start redirect and the callback. */
export const OAUTH_COOKIE = 'kora_oauth';
/** Only sent to the start and callback routes. */
export const OAUTH_COOKIE_PATH = '/api/v1/auth/oauth';
export const OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000;

export interface OAuthCookiePayload {
  provider: OAuthProvider;
  state: string;
  codeVerifier?: string;
  next?: string;
  /** Epoch ms; enforced server-side as well as by the cookie's Max-Age. */
  exp: number;
}

const payloadSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
  state: z.string().min(1),
  codeVerifier: z.string().min(1).optional(),
  next: z.string().optional(),
  exp: z.number().int(),
});

/** Domain-separated so this MAC can never be mistaken for one SESSION_SECRET makes elsewhere. */
function sign(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`kora_oauth:${data}`).digest();
}

/** `base64url(json).base64url(hmac-sha256)` keyed with SESSION_SECRET. */
export function sealOAuthCookie(payload: OAuthCookiePayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data, secret).toString('base64url')}`;
}

/** The payload if the value is authentic, well-formed and not expired; otherwise null. */
export function openOAuthCookie(
  value: unknown,
  secret: string,
  now: Date,
): OAuthCookiePayload | null {
  if (typeof value !== 'string') return null;
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const data = value.slice(0, dot);
  const mac = Buffer.from(value.slice(dot + 1), 'base64url');
  const expected = sign(data, secret);
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success || parsed.data.exp <= now.getTime()) return null;
  return parsed.data;
}

/**
 * A post-sign-in target is kept only if it is a same-origin path: a single leading `/` (not `//`
 * or `/\`, which browsers treat as protocol-relative) and no control characters (browsers strip
 * tabs/newlines, turning `/\t/host` into `//host`). Anything else is ignored.
 */
export function safeNextPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return undefined;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value;
}
