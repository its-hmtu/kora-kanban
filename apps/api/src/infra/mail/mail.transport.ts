import { Resend } from 'resend';
import { createTransport, type Transporter } from 'nodemailer';
import type { Env } from '../config/env';

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

export class ResendTransport implements MailTransport {
  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(message: MailMessage): Promise<void> {
    const { error } = await this.resend.emails.send(message);
    if (error) throw new Error(`Resend rejected the email: ${error.message}`);
  }
}

/** SMTP transport; in development this talks to Mailpit. */
export class SmtpTransport implements MailTransport {
  private readonly transporter: Transporter;

  constructor(smtpUrl: string) {
    this.transporter = createTransport(smtpUrl);
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail(message);
  }
}

/** Resend when `RESEND_API_KEY` is set, otherwise SMTP (Mailpit in dev). */
export function createMailTransport(
  config: Pick<Env, 'RESEND_API_KEY' | 'SMTP_URL'>,
): MailTransport {
  return config.RESEND_API_KEY
    ? new ResendTransport(config.RESEND_API_KEY)
    : new SmtpTransport(config.SMTP_URL);
}
