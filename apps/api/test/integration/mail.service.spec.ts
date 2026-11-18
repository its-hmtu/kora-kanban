import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConfigModule } from '../../src/infra/config/config.module';
import { MailModule } from '../../src/infra/mail/mail.module';
import { MailService } from '../../src/infra/mail/mail.service';
import { QueueModule } from '../../src/infra/queue/queue.module';
import { closeHarness, getPrisma, resetDb } from '../setup/test-app';

let moduleRef: TestingModule;

beforeAll(async () => {
  await getPrisma(); // sets the harness env
  moduleRef = await Test.createTestingModule({
    imports: [ConfigModule, QueueModule, MailModule],
  }).compile();
  await moduleRef.init();
});

beforeEach(resetDb);

afterAll(async () => {
  await moduleRef?.close();
  await closeHarness();
});

describe('MailService', () => {
  it('enqueues the message on the email queue', async () => {
    const mail = moduleRef.get(MailService);
    await mail.send({
      to: 'ada@example.com',
      template: 'verify-email',
      props: { name: 'Ada', url: 'https://kora.test/verify' },
      locale: 'en',
    });

    const queue = moduleRef.get<Queue>(getQueueToken('email'));
    const jobs = await queue.getJobs(['waiting']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toEqual({
      to: 'ada@example.com',
      template: 'verify-email',
      props: { name: 'Ada', url: 'https://kora.test/verify' },
      locale: 'en',
    });
    expect(jobs[0]?.opts.attempts).toBeGreaterThan(1);
  });
});
