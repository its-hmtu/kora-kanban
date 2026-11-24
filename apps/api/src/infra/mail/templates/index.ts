import type { Locale } from '@kora/shared';
import type { ReactElement } from 'react';
import { resetPassword, type ResetPasswordProps } from './reset-password';
import { verifyEmail, type VerifyEmailProps } from './verify-email';

export interface EmailTemplate<P> {
  subject: (props: P, locale: Locale) => string;
  render: (props: P, locale: Locale) => ReactElement;
}

/** Template registry: add new emails here (name -> subject + React Email component). */
export const templates = {
  'verify-email': verifyEmail,
  'reset-password': resetPassword,
} satisfies Record<string, EmailTemplate<never>>;

/** Job props per template; the locale travels separately on the job (`EmailJob.locale`). */
export interface TemplateProps {
  'verify-email': Omit<VerifyEmailProps, 'locale'>;
  'reset-password': Omit<ResetPasswordProps, 'locale'>;
}

export type TemplateName = keyof TemplateProps;
