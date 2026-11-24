import { z } from 'zod';
import { PASSWORD_MIN, USER_NAME_MAX } from '../constants';
import { localeSchema } from './common';

const PASSWORD_MAX = 200;

const email = z.string().trim().toLowerCase().pipe(z.email());
const newPassword = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

const isIanaTimezone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const registerSchema = z.object({
  email,
  password: newPassword,
  name: z.string().min(1).max(USER_NAME_MAX),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/** The password minimum is deliberately not enforced at sign-in. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({ email });
export type ForgotInput = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({
  token: z.string().min(1),
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
    name: z.string().min(1).max(USER_NAME_MAX),
    avatarUrl: z
      .url()
      .refine((v) => v.startsWith('https://'), 'must be an https URL')
      .nullable(),
    locale: localeSchema,
    theme: z.enum(['light', 'dark', 'system']),
    timezone: z.string().min(1).refine(isIanaTimezone, 'must be an IANA time zone'),
  })
  .partial();
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
