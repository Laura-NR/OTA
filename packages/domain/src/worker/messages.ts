/**
 * Worker ↔ desk messages (`docs/schema-w-messages.md`, approved M1–M8): a
 * worker's one thread with the desk. Pure: the API stores, the app queues and
 * sends, the desk reads.
 */

import { serviceCalendarDay } from '../dispatch/availability';
import { zonedCalendarDay } from '../time/ops-calendar';
import { JOB_STEP_CLOCK_TOLERANCE_MS } from './job';

/** A message's longest body, as a traveler's (M7). */
export const WORKER_MESSAGE_MAX_LENGTH = 2000;

/** How many of the thread's latest messages W-Home carries and the phone keeps (M5). */
export const WORKER_HOME_MESSAGES = 20;

/**
 * Why a worker's message cannot be kept, or null when it can:
 * - `in_future`: its time of writing is ahead of the API's clock (the steps'
 *   rule, M4);
 * - `not_your_job`: it names a service the worker was never offered or given.
 */
export type WorkerMessageRefusal = 'in_future' | 'not_your_job';

/** The service a message names, as far as whose it is. */
export interface WorkerMessageJob {
  /** The supplier the service is assigned to, if any. */
  supplierId: string | null;
  /** Every supplier the service was ever offered to. */
  offeredSupplierIds: readonly string[];
}

export function workerMessageRefusal(input: {
  supplierId: string;
  /** The phone's time of writing, corrected by the API's clock; null when not sent. */
  writtenAt: Date | null;
  now: Date;
  /** The service the message names: undefined when it names none, null when it does not exist. */
  job?: WorkerMessageJob | null;
}): WorkerMessageRefusal | null {
  const { supplierId, writtenAt, now, job } = input;
  if (writtenAt && writtenAt.getTime() > now.getTime() + JOB_STEP_CLOCK_TOLERANCE_MS) {
    return 'in_future';
  }
  if (job === null) return 'not_your_job';
  if (
    job &&
    job.supplierId !== supplierId &&
    !job.offeredSupplierIds.includes(supplierId)
  ) {
    return 'not_your_job';
  }
  return null;
}

/**
 * Whether a message reached the API well after it was written (no signal),
 * so the desk shows both times: "13:52 · arrived 15:05" (M4).
 */
export function messageArrivedLate(writtenAt: Date | null, receivedAt: Date): boolean {
  return (
    writtenAt !== null &&
    receivedAt.getTime() - writtenAt.getTime() > JOB_STEP_CLOCK_TOLERANCE_MS
  );
}

/**
 * Whether a job runs today in Havana, from its first day to its last (stored
 * dates are calendar days): a worker writing about it makes the thread urgent
 * on AL-Inbox (M6).
 */
export function jobRunsToday(job: { startsAt: Date; endsAt: Date }, now: Date): boolean {
  const today = serviceCalendarDay(zonedCalendarDay(now));
  return (
    serviceCalendarDay(job.startsAt) <= today && today <= serviceCalendarDay(job.endsAt)
  );
}

/** A message waiting on the phone (M4), with the id that keeps it single. */
export interface WorkerMessageDraft {
  clientRef: string;
  body: string;
  /** The job it is about, when written from W-Job. */
  serviceItemId: string | null;
  /** The time of writing, ISO 8601, corrected by the API's clock. */
  writtenAt: string;
  attempts: number;
}

/**
 * The queue with this message added, last: messages go in the order they
 * were written. A message already waiting with the same id is not added
 * again.
 */
export function queueWorkerMessage(
  queue: readonly WorkerMessageDraft[],
  draft: Omit<WorkerMessageDraft, 'attempts'>,
): WorkerMessageDraft[] {
  if (queue.some((queued) => queued.clientRef === draft.clientRef)) return [...queue];
  return [...queue, { ...draft, attempts: 0 }];
}
