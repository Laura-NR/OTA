import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SentEvent {
  event: string;
  context: Record<string, string>;
  params: Record<string, unknown>;
}

/**
 * The T-Events the page sends and the sink's receipts for them. Only batches
 * sent with fetch are read: a beacon's body (a page being left) is not
 * visible to Playwright.
 */
export function watchTelemetry(page: Page) {
  const events: SentEvent[] = [];
  const receipts: { status: number; accepted?: number; rejected?: number }[] = [];
  page.on('request', (request) => {
    if (!request.url().includes('/telemetry/events')) {
      return;
    }
    const body = request.postDataBuffer();
    if (body) {
      events.push(...(JSON.parse(body.toString()) as { events: SentEvent[] }).events);
    }
  });
  page.on('response', (response) => {
    if (response.url().includes('/telemetry/events')) {
      void response
        .json()
        .then((body: { accepted: number; rejected: number }) =>
          receipts.push({ status: response.status(), ...body }),
        )
        .catch(() => receipts.push({ status: response.status() }));
    }
  });
  const named = (name: string) => events.filter((event) => event.event === name);
  return { events, receipts, named };
}

/**
 * Where the e2e stack's mock sink also writes every event it keeps
 * (`TELEMETRY_SINK_FILE`, set by playwright.config.ts on its webServer), so a
 * spec can read the events the API records itself.
 */
export const TELEMETRY_SINK_FILE = path.resolve(
  __dirname,
  '..',
  '.telemetry',
  'e2e-events.jsonl',
);

/** Why a poll on `serverEvents` found nothing, when the file is the cause. */
export const SERVER_EVENTS_HINT =
  'server T-Events in the mock sink file: a dev stack started outside Playwright ' +
  `needs TELEMETRY_SINK_FILE=${TELEMETRY_SINK_FILE}`;

/** The events the API recorded itself (app `server`) since `since`, oldest first. */
export async function serverEvents(since: Date): Promise<SentEvent[]> {
  let text: string;
  try {
    text = await readFile(TELEMETRY_SINK_FILE, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SentEvent & { receivedAt: string })
    .filter(
      (event) =>
        event.context.app === 'server' && Date.parse(event.receivedAt) >= since.getTime(),
    );
}
