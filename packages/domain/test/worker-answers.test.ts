import { describe, expect, it } from 'vitest';

import {
  WORKER_BACKGROUND_RESEND_MINUTES,
  needsBackgroundResend,
  queueWorkerAnswer,
  workerAnswerOutcome,
  workerAnswerRetryDelayMs,
  type WorkerAnswer,
} from '../src';

const AT = '2026-11-09T10:00:00.000Z';

describe('the worker app answer queue (spec §7.2)', () => {
  it('sends only the last answer given for an offer', () => {
    const declined = queueWorkerAnswer([], {
      serviceItemId: 'item-1',
      kind: 'decline',
      reason: 'Problema con el vehículo',
      answeredAt: AT,
    });
    const other = queueWorkerAnswer(declined, {
      serviceItemId: 'item-2',
      kind: 'accept',
      answeredAt: AT,
    });
    const changed = queueWorkerAnswer(
      other.map((answer): WorkerAnswer => ({ ...answer, attempts: 3 })),
      { serviceItemId: 'item-1', kind: 'accept', answeredAt: AT },
    );
    expect(changed).toEqual([
      { serviceItemId: 'item-2', kind: 'accept', answeredAt: AT, attempts: 3 },
      { serviceItemId: 'item-1', kind: 'accept', answeredAt: AT, attempts: 0 },
    ]);
  });

  it('drops an answer the API took or refused, and keeps the rest', () => {
    expect(workerAnswerOutcome(200)).toBe('sent');
    expect(workerAnswerOutcome(201)).toBe('sent');
    expect(workerAnswerOutcome(409)).toBe('refused');
    expect(workerAnswerOutcome(404)).toBe('refused');
    expect(workerAnswerOutcome(403)).toBe('refused');
    expect(workerAnswerOutcome(401)).toBe('signed_out');
    expect(workerAnswerOutcome(429)).toBe('retry');
    expect(workerAnswerOutcome(503)).toBe('retry');
    expect(workerAnswerOutcome(null)).toBe('retry');
  });

  it('waits longer after each failed send, up to five minutes', () => {
    expect([1, 2, 3, 4, 9].map(workerAnswerRetryDelayMs)).toEqual([
      5_000, 15_000, 60_000, 300_000, 300_000,
    ]);
    expect(workerAnswerRetryDelayMs(0)).toBe(5_000);
  });

  it('resends in the background only while answers wait for a signed-in worker', () => {
    expect(needsBackgroundResend(1, true)).toBe(true);
    expect(needsBackgroundResend(0, true)).toBe(false);
    expect(needsBackgroundResend(2, false)).toBe(false);
  });

  it("waits at least Android's fifteen minutes between background resends", () => {
    expect(WORKER_BACKGROUND_RESEND_MINUTES).toBe(15);
  });
});
