import type { Locale } from '@kora/shared';
import type { TemplateName, TemplateProps } from './templates';

/** Payload of an `email` queue job (and the input of `MailService.send`). */
export type EmailJob = {
  [N in TemplateName]: { to: string; template: N; props: TemplateProps[N]; locale: Locale };
}[TemplateName];

export const EMAIL_QUEUE = 'email';
