import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { render } from '@react-email/render';
import type { Job } from 'bullmq';
import { APP_CONFIG } from '../config/config.module';
import type { Env } from '../config/env';
import { EMAIL_QUEUE, type EmailJob } from './mail.types';
import { MAIL_TRANSPORT, type MailTransport } from './mail.transport';
import { templates, type EmailTemplate } from './templates';

/** Renders React Email templates and delivers them. Registered in the worker process only. */
@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  constructor(
    @Inject(APP_CONFIG) private readonly config: Env,
    @Inject(MAIL_TRANSPORT) private readonly transport: MailTransport,
  ) {
    super();
  }

  async process(job: Job<EmailJob>): Promise<void> {
    const { to, template, props, locale } = job.data;
    const definition = (templates as Record<string, EmailTemplate<unknown> | undefined>)[template];
    if (!definition) throw new Error(`Unknown email template: ${template}`);

    const element = definition.render(props, locale);
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await this.transport.send({
      from: this.config.MAIL_FROM,
      to,
      subject: definition.subject(props, locale),
      html,
      text,
    });
  }
}
