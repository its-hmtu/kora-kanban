import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Mailpit (infra/docker-compose.dev.yml locally, a service container in CI) catches every email
 * the API worker sends over SMTP; its REST API lets tests read them.
 */
export const MAILPIT_URL = 'http://localhost:8025';

interface MessageSummary {
  ID: string;
}

interface Message {
  Text: string;
}

/** Plain-text bodies of every message Mailpit holds for `email`, newest first. */
async function messagesTo(request: APIRequestContext, email: string): Promise<string[]> {
  const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
    params: { query: `to:"${email}"` },
  });
  expect(search.ok(), `Mailpit search → ${search.status()}`).toBe(true);
  const { messages } = (await search.json()) as { messages: MessageSummary[] };
  return Promise.all(
    messages.map(async ({ ID }) => {
      const res = await request.get(`${MAILPIT_URL}/api/v1/message/${ID}`);
      expect(res.ok(), `Mailpit message ${ID} → ${res.status()}`).toBe(true);
      return ((await res.json()) as Message).Text;
    }),
  );
}

/**
 * Polls Mailpit until an email to `email` contains a link to `${origin}${path}?token=…` and
 * returns that link (from the newest such email). Emails go out through the BullMQ worker, so
 * they arrive asynchronously.
 */
export async function waitForEmailLink(
  request: APIRequestContext,
  { email, origin, path }: { email: string; origin: string; path: string },
): Promise<string> {
  const pattern = new RegExp(`${escapeRegExp(`${origin}${path}`)}\\?token=[\\w-]+`);
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        for (const text of await messagesTo(request, email)) {
          link = pattern.exec(text)?.[0];
          if (link) return true;
        }
        return false;
      },
      { message: `an email to ${email} with a ${path} link`, timeout: 20_000 },
    )
    .toBe(true);
  if (!link) throw new Error('unreachable: poll succeeded without a link');
  return link;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
