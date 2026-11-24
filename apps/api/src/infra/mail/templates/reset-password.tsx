import type { Locale } from '@kora/shared';
import en from '../../../common/i18n/messages/en.json';
import { ActionEmail, type ActionEmailStrings } from './action-email';
import { pick, type Dictionary } from './i18n';

export interface ResetPasswordProps {
  name: string;
  url: string;
  locale: Locale;
}

const strings: Dictionary<ActionEmailStrings> = { en: en.email.resetPassword };

/** Sent by "forgot password"; `url` is `${APP_URL}/reset-password?token=…` (valid 1 h). */
export function ResetPassword({ name, url, locale }: ResetPasswordProps) {
  return <ActionEmail t={pick(strings, locale)} name={name} url={url} locale={locale} />;
}

export const resetPassword = {
  subject: (_props: Omit<ResetPasswordProps, 'locale'>, locale: Locale) =>
    pick(strings, locale).subject,
  render: (props: Omit<ResetPasswordProps, 'locale'>, locale: Locale) => (
    <ResetPassword {...props} locale={locale} />
  ),
};
