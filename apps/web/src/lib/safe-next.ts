/**
 * Validates a post-login `next` target. Only a same-origin path is accepted: it must start with
 * a single `/` (so `//host` and `/\host`, which browsers treat as protocol-relative, are
 * rejected) and contain no control characters. Anything else falls back to `/`.
 */
export function safeNext(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return '/';
  return value;
}
