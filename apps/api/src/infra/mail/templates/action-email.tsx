import type { Locale } from '@kora/shared';
import { Button, Heading, Text } from '@react-email/components';
import { format } from './i18n';
import { EmailLayout } from './layout';

export interface ActionEmailStrings {
  subject: string;
  heading: string;
  greeting: string;
  body: string;
  cta: string;
  fallback: string;
  /** Optional closing note (e.g. "ignore this if it wasn't you"). */
  ignore?: string;
}

interface ActionEmailProps {
  t: ActionEmailStrings;
  name: string;
  url: string;
  locale: Locale;
}

/** Shared body of the "click this link" emails (verify email, reset password). */
export function ActionEmail({ t, name, url, locale }: ActionEmailProps) {
  return (
    <EmailLayout locale={locale} preview={t.subject}>
      <Heading as="h1">{t.heading}</Heading>
      <Text>{format(t.greeting, { name })}</Text>
      <Text>{t.body}</Text>
      <Button
        href={url}
        style={{ backgroundColor: '#18181b', color: '#ffffff', padding: '10px 16px' }}
      >
        {t.cta}
      </Button>
      <Text>{t.fallback}</Text>
      <Text>{url}</Text>
      {t.ignore ? <Text>{t.ignore}</Text> : null}
    </EmailLayout>
  );
}
