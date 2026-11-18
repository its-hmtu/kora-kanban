import type { Locale } from '@kora/shared';
import { Button, Heading, Text } from '@react-email/components';
import { pick, type Dictionary } from './i18n';
import { EmailLayout } from './layout';

export interface VerifyEmailProps {
  name: string;
  url: string;
}

const strings: Dictionary<{ subject: string; heading: string; body: string; cta: string }> = {
  en: {
    subject: 'Verify your email address',
    heading: 'Verify your email address',
    body: 'Confirm your email address to finish setting up your Kora account.',
    cta: 'Verify email',
  },
};

export const verifyEmail = {
  subject: (_props: VerifyEmailProps, locale: Locale) => pick(strings, locale).subject,
  render: (props: VerifyEmailProps, locale: Locale) => {
    const t = pick(strings, locale);
    return (
      <EmailLayout locale={locale} preview={t.subject}>
        <Heading as="h1">{t.heading}</Heading>
        <Text>{props.name}</Text>
        <Text>{t.body}</Text>
        <Button
          href={props.url}
          style={{ backgroundColor: '#18181b', color: '#ffffff', padding: '10px 16px' }}
        >
          {t.cta}
        </Button>
        <Text>{props.url}</Text>
      </EmailLayout>
    );
  },
};
