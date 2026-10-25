import type { Page } from '@playwright/test';

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
