import type { Page } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3001';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const BACKOFFICE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3002';

interface MailpitMessage {
  ID: string;
  To?: { Address: string }[];
}

function decodeEntities(value: string): string {
  return value.replaceAll('&amp;', '&');
}

async function latestMagicLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const listResponse = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    const { messages } = (await listResponse.json()) as { messages: MailpitMessage[] };
    const message = messages.find((candidate) =>
      candidate.To?.some((recipient) => recipient.Address === email),
    );

    if (message) {
      const detailResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`);
      const detail = (await detailResponse.json()) as { Text?: string; HTML?: string };
      const body = `${detail.Text ?? ''}\n${detail.HTML ?? ''}`;
      const match = body.match(
        /https?:\/\/[^\s"'<>]*\/api\/auth\/magic-link\/verify[^\s"'<>]+/,
      );
      if (match) {
        return decodeEntities(match[0]);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`No magic-link email arrived for ${email}`);
}

/**
 * Sign in through the real magic-link flow: request the link, read it from
 * Mailpit, and follow it in the browser. Defaults to the back-office dashboard;
 * pass `origin`/`callbackPath` to sign in to the storefront instead.
 */
export async function signIn(
  page: Page,
  email = 'admin@example.test',
  options: { origin?: string; callbackPath?: string } = {},
): Promise<void> {
  const origin = options.origin ?? BACKOFFICE_URL;
  const callbackPath = options.callbackPath ?? '/';
  const callbackURL = `${origin}${callbackPath}`;

  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' }).catch(
    () => undefined,
  );

  const response = await fetch(`${API_URL}/api/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, callbackURL }),
  });
  if (!response.ok) {
    throw new Error(
      `Magic-link request failed: ${response.status} ${await response.text()}`,
    );
  }

  const url = await latestMagicLink(email);
  await page.goto(url);
  await page.waitForURL((current) => current.href === callbackURL);
}
