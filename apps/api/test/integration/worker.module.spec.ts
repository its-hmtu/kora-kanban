import { Test, type TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailProcessor } from '../../src/infra/mail/email.processor';
import { MailModule } from '../../src/infra/mail/mail.module';
import { MailService } from '../../src/infra/mail/mail.service';
import { MAIL_TRANSPORT, type MailMessage } from '../../src/infra/mail/mail.transport';
import { WorkerModule } from '../../src/worker.module';
import { closeHarness, getPrisma, resetDb } from '../setup/test-app';

const sent: MailMessage[] = [];
let moduleRef: TestingModule;

beforeAll(async () => {
  await getPrisma(); // sets the harness env
  moduleRef = await Test.createTestingModule({ imports: [WorkerModule, MailModule] })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue({ send: async (m: MailMessage) => void sent.push(m) })
    .compile();
  await moduleRef.init();
});

beforeEach(async () => {
  await resetDb();
  sent.length = 0;
});

afterAll(async () => {
  await moduleRef?.close();
  await closeHarness();
});

describe('WorkerModule', () => {
  it('registers the email processor', () => {
    expect(moduleRef.get(EmailProcessor)).toBeInstanceOf(EmailProcessor);
  });

  it('consumes a queued email end to end', async () => {
    await moduleRef.get(MailService).send({
      to: 'ada@example.com',
      template: 'verify-email',
      props: { name: 'Ada', url: 'https://kora.test/verify' },
      locale: 'en',
    });
    await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1);
    expect(sent[0]?.to).toBe('ada@example.com');
  });
});
