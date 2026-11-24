import { z } from 'zod';
import { PASSWORD_MIN, USER_NAME_MAX } from '../constants';
import { localeSchema } from './common';

const PASSWORD_MAX = 200;

/** `.invalid` is reserved (RFC 2606); the API uses it for the placeholder email of deleted accounts. */
export const isReservedEmail = (value: string): boolean => /\.invalid$/i.test(value);

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email())
  .refine((value) => !isReservedEmail(value));
const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

const name = z.string().trim().min(1).max(USER_NAME_MAX);

/** IANA-shaped: two or more `/`-separated segments, each starting with an uppercase letter. */
const IANA_ZONE_SHAPE = /^[A-Z][A-Za-z0-9_+-]*(?:\/[A-Z][A-Za-z0-9_+-]*)+$/;

/**
 * `UTC`, or an IANA-shaped id the runtime's Intl accepts. The shape check rejects case variants
 * and offsets (which Intl would accept); Intl rejects unknown zones. Not checked against
 * `Intl.supportedValuesOf`, which lists legacy names (e.g. Asia/Saigon, not Asia/Ho_Chi_Minh).
 */
const isSupportedTimeZone = (value: string): boolean => {
  if (value === 'UTC') return true;
  if (!IANA_ZONE_SHAPE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const registerSchema = z.object({
  email,
  password: newPassword,
  name,
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** The password minimum is deliberately not enforced at sign-in. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(1).max(128) });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotSchema = z.object({ email });
export type ForgotInput = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({
  token: z.string().min(1).max(128),
  password: newPassword,
});
export type ResetInput = z.infer<typeof resetSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateMeSchema = z
  .strictObject({
    name,
    avatarUrl: z
      .url()
      .refine((v) => v.startsWith('https://'), 'must be an https URL')
      .nullable(),
    locale: localeSchema,
    theme: z.enum(['light', 'dark', 'system']),
    timezone: z.string().refine(isSupportedTimeZone, 'must be a supported time zone'),
  })
  .partial();
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
