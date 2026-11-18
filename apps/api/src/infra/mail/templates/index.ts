import type { Locale } from '@kora/shared';
import type { ReactElement } from 'react';
import { verifyEmail, type VerifyEmailProps } from './verify-email';

export interface EmailTemplate<P> {
  subject: (props: P, locale: Locale) => string;
  render: (props: P, locale: Locale) => ReactElement;
}

/** Template registry: add new emails here (name -> subject + React Email component). */
export const templates = { 'verify-email': verifyEmail } satisfies Record<
  string,
  EmailTemplate<never>
>;

export interface TemplateProps {
  'verify-email': VerifyEmailProps;
}

export type TemplateName = keyof TemplateProps;
