import { z } from 'zod';
import { PASSWORD_MIN, USER_NAME_MAX } from '../constants';
import { localeSchema } from './common';

const PASSWORD_MAX = 200;

const email = z.string().trim().toLowerCase().pipe(z.email());
const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

const name = z.string().trim().min(1).max(USER_NAME_MAX);

let timeZones: ReadonlySet<string> | undefined;
/** Exact ids from the runtime's zone list plus `UTC`; rejects case variants and offsets. */
const isSupportedTimeZone = (value: string): boolean => {
  timeZones ??= new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
  return timeZones.has(value);
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
