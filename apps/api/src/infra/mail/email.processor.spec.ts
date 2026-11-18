import type { Job } from 'bullmq';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { EmailProcessor } from './email.processor';
import type { EmailJob } from './mail.types';
import {
  createMailTransport,
  ResendTransport,
  SmtpTransport,
  type MailMessage,
  type MailTransport,
} from './mail.transport';

const config = {
  MAIL_FROM: 'Kora <noreply@kora.test>',
  SMTP_URL: 'smtp://localhost:1025',
} as Env;

class FakeTransport implements MailTransport {
  sent: MailMessage[] = [];
  fail = false;
  async send(message: MailMessage): Promise<void> {
    if (this.fail) throw new Error('transport down');
    this.sent.push(message);
  }
}

const job = (data: EmailJob) => ({ data }) as Job<EmailJob>;

describe('EmailProcessor', () => {
  it('renders the template (layout included) and sends it through the transport', async () => {
    const transport = new FakeTransport();
    const processor = new EmailProcessor(config, transport);

    await processor.process(
      job({
        to: 'ada@example.com',
        template: 'verify-email',
        props: { name: 'Ada', url: 'https://kora.test/verify?token=abc' },
        locale: 'en',
      }),
    );

    expect(transport.sent).toHaveLength(1);
    const [message] = transport.sent;
    expect(message?.from).toBe('Kora <noreply@kora.test>');
    expect(message?.to).toBe('ada@example.com');
    expect(message?.subject).toBe('Verify your email address');
    expect(message?.html).toContain('lang="en"');
    expect(message?.html).toContain('Ada');
    expect(message?.html).toContain('https://kora.test/verify?token=abc');
    expect(message?.text).toContain('https://kora.test/verify?token=abc');
  });

  it('falls back to English for locales without a dictionary', async () => {
    const transport = new FakeTransport();
    await new EmailProcessor(config, transport).process(
      job({
        to: 'a@example.com',
        template: 'verify-email',
        props: { name: 'A', url: 'https://kora.test/v' },
        locale: 'vi',
      }),
    );
    expect(transport.sent[0]?.subject).toBe('Verify your email address');
    expect(transport.sent[0]?.html).toContain('lang="vi"');
  });

  it('rejects unknown templates and propagates transport failures (so BullMQ retries)', async () => {
    const transport = new FakeTransport();
    const processor = new EmailProcessor(config, transport);
    await expect(
      processor.process(
        job({ to: 'a@example.com', template: 'nope' as never, props: {} as never, locale: 'en' }),
      ),
    ).rejects.toThrow(/Unknown email template/);

    transport.fail = true;
    await expect(
      processor.process(
        job({
          to: 'a@example.com',
          template: 'verify-email',
          props: { name: 'A', url: 'https://kora.test/v' },
          locale: 'en',
        }),
      ),
    ).rejects.toThrow('transport down');
  });
});

describe('createMailTransport', () => {
  it('uses SMTP (Mailpit) when RESEND_API_KEY is empty', () => {
    expect(createMailTransport({ ...config, RESEND_API_KEY: undefined })).toBeInstanceOf(
      SmtpTransport,
    );
  });

  it('uses Resend when RESEND_API_KEY is set', () => {
    expect(createMailTransport({ ...config, RESEND_API_KEY: 're_test' })).toBeInstanceOf(
      ResendTransport,
    );
  });
});
