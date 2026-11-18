import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Producer side: inject `MailService` anywhere. Requires `QueueModule`. */
@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
