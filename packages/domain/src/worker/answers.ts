/**
 * The worker app's offline answers (spec §7.2 `sync_queue`, ADR 0007;
 * `docs/worker-app-plan.md` W6). An accept or decline is saved on the phone
 * first and sent when there is a connection; the API decides whether it still
 * counts. Pure: the app keeps the queue and makes the requests.
 */

export type WorkerAnswerKind = 'accept' | 'decline';

export interface WorkerAnswer {
  serviceItemId: string;
  kind: WorkerAnswerKind;
  /** The decline reason as sent to the API; absent for an accept. */
  reason?: string;
  /** When the worker answered, ISO 8601. */
  answeredAt: string;
  /** Sends tried so far without an answer from the API. */
  attempts: number;
}

/**
 * The queue with this answer added. A later answer for the same offer
 * replaces an unsent earlier one, so only the worker's last word is sent.
 */
export function queueWorkerAnswer(
  queue: readonly WorkerAnswer[],
  answer: Omit<WorkerAnswer, 'attempts'>,
): WorkerAnswer[] {
  return [
    ...queue.filter((queued) => queued.serviceItemId !== answer.serviceItemId),
    { ...answer, attempts: 0 },
  ];
}

/**
 * What a send's result means for the queued answer:
 * - `sent`: the API took it, so it leaves the queue;
 * - `refused`: the API answered no (the offer was withdrawn, timed out or is
 *   not this worker's), so it leaves the queue and the worker is told;
 * - `signed_out`: the session ended, so it stays until the worker signs in;
 * - `retry`: no connection, a rate limit or a server fault, so it stays.
 */
export type WorkerAnswerOutcome = 'sent' | 'refused' | 'signed_out' | 'retry';

/** The outcome for an HTTP status, or for no response at all (`null`). */
export function workerAnswerOutcome(status: number | null): WorkerAnswerOutcome {
  if (status === null) return 'retry';
  if (status >= 200 && status < 300) return 'sent';
  if (status === 401) return 'signed_out';
  if (status === 408 || status === 429 || status >= 500) return 'retry';
  return 'refused';
}

/** Waits between resends: 5 s, 15 s, 1 min, then every 5 min. */
const RESEND_DELAYS_MS = [5_000, 15_000, 60_000, 300_000];

/** How long to wait before resending an answer that has failed this many times. */
export function workerAnswerRetryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), RESEND_DELAYS_MS.length - 1);
  return RESEND_DELAYS_MS[index]!;
}
