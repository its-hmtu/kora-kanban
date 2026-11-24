import type { Locale } from '@kora/shared';
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';
import en from '../../../common/i18n/messages/en.json';
import { pick, type Dictionary } from './i18n';

const strings: Dictionary<{ footer: string }> = { en: en.email.layout };

export interface EmailLayoutProps {
  locale: Locale;
  /** Inbox preview text. */
  preview: string;
  children: ReactNode;
}

/** Base layout shared by every email; `locale` sets the document language and footer copy. */
export function EmailLayout({ locale, preview, children }: EmailLayoutProps) {
  const t = pick(strings, locale);
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        <Container
          style={{ backgroundColor: '#ffffff', margin: '24px auto', padding: 24, maxWidth: 560 }}
        >
          <Section>{children}</Section>
          <Text style={{ color: '#71717a', fontSize: 12, marginTop: 24 }}>{t.footer}</Text>
        </Container>
      </Body>
    </Html>
  );
}
