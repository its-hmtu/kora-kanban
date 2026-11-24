import { ErrorCode, PASSWORD_MIN } from '@kora/shared';
import type { TFunction } from 'i18next';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from '@/lib/api-client';

/** Maps a Zod issue type from the shared schemas to a localized message. */
export function validationMessage(t: TFunction, field: string, type?: string): string {
  if (type === 'invalid_format') return t('auth:validation.email');
  if (type === 'too_small') {
    return field === 'newPassword'
      ? t('auth:validation.passwordMin', { count: PASSWORD_MIN })
      : t('auth:validation.required');
  }
  if (type === 'too_big') return t('auth:validation.tooLong');
  return t('auth:validation.required');
}

/** Text for a field error: our own message for server/custom errors, else localized from the Zod issue type. */
export function fieldError(
  t: TFunction,
  field: string,
  error: { type?: string; message?: string } | undefined,
): string | undefined {
  if (!error) return undefined;
  if (error.type === 'server' || error.type === 'mismatch') return error.message;
  return validationMessage(t, field, error.type);
}

function codeMessage(t: TFunction, code: string): string | undefined {
  switch (code) {
    case 'EMAIL_TAKEN':
      return t('auth:errors.emailTaken');
    case 'PASSWORD_BREACHED':
      return t('auth:errors.passwordBreached');
    case 'TOKEN_INVALID':
      return t('auth:errors.tokenInvalid');
    default:
      return undefined;
  }
}

function serverFieldErrors(err: ApiError): Record<string, string[]> {
  const fe = (err.details as { fieldErrors?: unknown } | undefined)?.fieldErrors;
  return fe && typeof fe === 'object' ? (fe as Record<string, string[]>) : {};
}

/**
 * Puts known API field errors on their fields and returns a form-level message for anything
 * else (throttling, 401 when `unauthenticated` is given, unknown failures), or null when every
 * error landed on a field.
 */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  t: TFunction,
  setError: UseFormSetError<T>,
  options: { unauthenticated?: string } = {},
): string | null {
  if (!(err instanceof ApiError)) return t('auth:errors.generic');
  if (err.status === 429 || err.code === ErrorCode.RATE_LIMITED) return t('auth:errors.throttled');
  if (err.status === 401 && options.unauthenticated) return options.unauthenticated;
  let placed = false;
  for (const [field, codes] of Object.entries(serverFieldErrors(err))) {
    const message = codes.map((c) => codeMessage(t, c)).find(Boolean);
    if (message) {
      setError(field as Path<T>, { type: 'server', message });
      placed = true;
    }
  }
  return placed ? null : t('auth:errors.generic');
}

/** Message for a failed non-form request (verify, reset with a bad token). */
export function isTokenInvalid(err: unknown): boolean {
  return (
    err instanceof ApiError && serverFieldErrors(err).token?.includes('TOKEN_INVALID') === true
  );
}

/** Message for a failed request that has no form: throttled, or generic for anything else. */
export function failureMessage(err: unknown, t: TFunction): string {
  const throttled =
    err instanceof ApiError && (err.status === 429 || err.code === ErrorCode.RATE_LIMITED);
  return throttled ? t('auth:errors.throttled') : t('auth:errors.generic');
}
