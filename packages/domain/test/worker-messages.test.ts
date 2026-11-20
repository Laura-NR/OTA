import { describe, expect, it } from 'vitest';

import {
  jobRunsToday,
  messageArrivedLate,
  queueWorkerMessage,
  workerMessageRefusal,
} from '../src';

const NOW = new Date('2026-11-16T15:05:00.000Z');
const SUPPLIER = 'supplier-1';

describe("a worker's message (docs/schema-w-messages.md M2, M4)", () => {
  it('keeps a message about no job, or about one of their own', () => {
    expect(
      workerMessageRefusal({ supplierId: SUPPLIER, writtenAt: NOW, now: NOW }),
    ).toBeNull();
    expect(
      workerMessageRefusal({
        supplierId: SUPPLIER,
        writtenAt: null,
        now: NOW,
        job: { supplierId: SUPPLIER, offeredSupplierIds: [] },
      }),
    ).toBeNull();
  });

  it('keeps one about a job only offered to them, which they may ask about', () => {
    expect(
      workerMessageRefusal({
        supplierId: SUPPLIER,
        writtenAt: NOW,
        now: NOW,
        job: { supplierId: null, offeredSupplierIds: ['supplier-2', SUPPLIER] },
      }),
    ).toBeNull();
  });

  it("refuses one naming another worker's job, or a job that does not exist", () => {
    expect(
      workerMessageRefusal({
        supplierId: SUPPLIER,
        writtenAt: NOW,
        now: NOW,
        job: { supplierId: 'supplier-2', offeredSupplierIds: ['supplier-2'] },
      }),
    ).toBe('not_your_job');
    expect(
      workerMessageRefusal({ supplierId: SUPPLIER, writtenAt: NOW, now: NOW, job: null }),
    ).toBe('not_your_job');
  });

  it("refuses a time of writing ahead of the API's clock, as the steps do", () => {
    const ahead = (ms: number) => new Date(NOW.getTime() + ms);
    expect(
      workerMessageRefusal({
        supplierId: SUPPLIER,
        writtenAt: ahead(2 * 60_000),
        now: NOW,
      }),
    ).toBeNull();
    expect(
      workerMessageRefusal({
        supplierId: SUPPLIER,
        writtenAt: ahead(3 * 60_000),
        now: NOW,
      }),
    ).toBe('in_future');
  });

  it('shows both times when a message waited on the phone', () => {
    const written = new Date('2026-11-16T13:52:00.000Z');
    expect(messageArrivedLate(written, NOW)).toBe(true);
    expect(messageArrivedLate(new Date(NOW.getTime() - 60_000), NOW)).toBe(false);
    expect(messageArrivedLate(null, NOW)).toBe(false);
  });
});

describe("a job running today in Havana (M6's urgency)", () => {
  const job = (start: string, end: string) => ({
    startsAt: new Date(start),
    endsAt: new Date(end),
  });

  it('runs from its first day to its last', () => {
    expect(jobRunsToday(job('2026-11-16T00:00:00Z', '2026-11-16T00:00:00Z'), NOW)).toBe(
      true,
    );
    expect(jobRunsToday(job('2026-11-14T00:00:00Z', '2026-11-18T00:00:00Z'), NOW)).toBe(
      true,
    );
    expect(jobRunsToday(job('2026-11-17T00:00:00Z', '2026-11-18T00:00:00Z'), NOW)).toBe(
      false,
    );
    expect(jobRunsToday(job('2026-11-10T00:00:00Z', '2026-11-15T00:00:00Z'), NOW)).toBe(
      false,
    );
  });

  it("reads today on Havana's clock, not UTC's", () => {
    // 02:00 UTC on the 17th is still the evening of the 16th in Havana.
    const lateEvening = new Date('2026-11-17T02:00:00.000Z');
    expect(
      jobRunsToday(job('2026-11-16T00:00:00Z', '2026-11-16T00:00:00Z'), lateEvening),
    ).toBe(true);
  });
});

describe('the messages waiting on the phone (M4)', () => {
  const draft = (clientRef: string) => ({
    clientRef,
    body: 'Listo, salgo a las 15:30.',
    serviceItemId: null,
    writtenAt: '2026-11-16T13:52:00.000Z',
  });

  it('keeps them in the order they were written', () => {
    const queue = queueWorkerMessage(queueWorkerMessage([], draft('a')), draft('b'));
    expect(queue.map((queued) => queued.clientRef)).toEqual(['a', 'b']);
    expect(queue.every((queued) => queued.attempts === 0)).toBe(true);
  });

  it('does not add the same message twice', () => {
    const queue = queueWorkerMessage([], draft('a'));
    expect(queueWorkerMessage(queue, draft('a'))).toEqual(queue);
  });
});
