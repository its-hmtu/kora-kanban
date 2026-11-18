import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { EMAIL_QUEUE, type EmailJob } from './mail.types';

@Injectable()
export class MailService {
  constructor(@InjectQueue(EMAIL_QUEUE) private readonly queue: Queue<EmailJob>) {}

  /** Enqueues an email; rendering and delivery happen in the worker (`EmailProcessor`). */
  async send(message: EmailJob): Promise<void> {
    await this.queue.add('send', message, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 1_000,
    });
  }
}
