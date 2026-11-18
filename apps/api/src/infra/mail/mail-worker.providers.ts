import type { Provider } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { Env } from '../config/env';
import { EmailProcessor } from './email.processor';
import { createMailTransport, MAIL_TRANSPORT } from './mail.transport';

/** Consumer side of the mail queue; listed in `WorkerModule` only (never in the HTTP app). */
export const mailWorkerProviders: Provider[] = [
  { provide: MAIL_TRANSPORT, inject: [APP_CONFIG], useFactory: (c: Env) => createMailTransport(c) },
  EmailProcessor,
];
