import type { Locale } from '@kora/shared';
import en from '../../../common/i18n/messages/en.json';
import { ActionEmail, type ActionEmailStrings } from './action-email';
import { pick, type Dictionary } from './i18n';

export interface VerifyEmailProps {
  name: string;
  url: string;
  locale: Locale;
}

const strings: Dictionary<ActionEmailStrings> = { en: en.email.verifyEmail };

/** Sent after password sign-up; `url` is `${APP_URL}/verify-email?token=…`. */
export function VerifyEmail({ name, url, locale }: VerifyEmailProps) {
  return <ActionEmail t={pick(strings, locale)} name={name} url={url} locale={locale} />;
}

export const verifyEmail = {
  subject: (_props: Omit<VerifyEmailProps, 'locale'>, locale: Locale) =>
    pick(strings, locale).subject,
  render: (props: Omit<VerifyEmailProps, 'locale'>, locale: Locale) => (
    <VerifyEmail {...props} locale={locale} />
  ),
};
