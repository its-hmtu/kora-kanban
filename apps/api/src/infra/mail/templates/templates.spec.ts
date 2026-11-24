import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import en from '../../../common/i18n/messages/en.json';
import { templates } from './index';

const props = { name: 'Ada', url: 'https://kora.test/x?token=abc' };

async function renderEmail(name: keyof typeof templates, locale: 'en' | 'vi' = 'en') {
  const element = templates[name].render(props, locale);
  return {
    subject: templates[name].subject(props, locale),
    html: await render(element),
    text: await render(element, { plainText: true }),
  };
}

describe('email templates', () => {
  it('verify-email: English strings from en.json, greeting, link and button', async () => {
    const { subject, html, text } = await renderEmail('verify-email');
    expect(subject).toBe(en.email.verifyEmail.subject);
    expect(html).toContain('lang="en"');
    expect(html).toContain('href="https://kora.test/x?token=abc"');
    expect(text).toContain('Hi Ada,');
    expect(text).toContain(en.email.verifyEmail.body);
    expect(text).toContain(en.email.layout.footer);
    expect(text).toMatchSnapshot();
  });

  it('reset-password: English strings from en.json, greeting, link and button', async () => {
    const { subject, html, text } = await renderEmail('reset-password');
    expect(subject).toBe(en.email.resetPassword.subject);
    expect(html).toContain('lang="en"');
    expect(html).toContain('href="https://kora.test/x?token=abc"');
    expect(text).toContain('Hi Ada,');
    expect(text).toContain(en.email.resetPassword.body);
    expect(text).toContain(en.email.resetPassword.ignore);
    expect(text).toMatchSnapshot();
  });

  it('falls back to English for a locale without strings, but keeps the document language', async () => {
    const { subject, html } = await renderEmail('reset-password', 'vi');
    expect(subject).toBe(en.email.resetPassword.subject);
    expect(html).toContain('lang="vi"');
  });

  it('escapes the user-controlled name', async () => {
    const element = templates['verify-email'].render(
      { name: '<script>x</script>', url: 'https://kora.test/v' },
      'en',
    );
    expect(await render(element)).not.toContain('<script>x</script>');
  });
});
