import { queueWorkerAnswer, workerAnswerOutcome, type WorkerAnswer } from '@ota/domain';

import type { WorkerApi } from './api';

/** The little the app keeps on the phone: SQLite on Android, localStorage on the web preview. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const QUEUE_KEY = 'ota.worker.answers';

export async function loadAnswers(store: KeyValueStore): Promise<WorkerAnswer[]> {
  const raw = await store.get(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as WorkerAnswer[]) : [];
  } catch {
    return [];
  }
}

async function saveAnswers(store: KeyValueStore, queue: WorkerAnswer[]): Promise<void> {
  if (queue.length === 0) await store.remove(QUEUE_KEY);
  else await store.set(QUEUE_KEY, JSON.stringify(queue));
}

/** Saves an answer on the phone first, replacing an unsent one for the same offer. */
export async function saveAnswer(
  store: KeyValueStore,
  answer: Omit<WorkerAnswer, 'attempts'>,
): Promise<WorkerAnswer[]> {
  const queue = queueWorkerAnswer(await loadAnswers(store), answer);
  await saveAnswers(store, queue);
  return queue;
}

export interface FlushResult {
  /** Answers the API took. */
  sent: WorkerAnswer[];
  /** Answers the API refused (the offer timed out or was withdrawn meanwhile). */
  refused: WorkerAnswer[];
  /** Still waiting for a connection, oldest first. */
  pending: WorkerAnswer[];
  /** The session ended; the rest waits for the worker to sign in again. */
  signedOut: boolean;
}

/** The flush running now in this JavaScript runtime, if any. */
let flushing: Promise<unknown> = Promise.resolve();

/**
 * Sends the queued answers in order (spec §7.2). It stops at the first one
 * that gets no answer, since the rest would fail the same way, and counts the
 * try against it so the next resend waits longer.
 *
 * One flush at a time: the background task can wake while the app is open
 * behind another app, and two flushes at once could send the same answer
 * twice, the API's refusal of the second reading as the offer having gone. A
 * flush asked for meanwhile starts when the current one ends and reads the
 * queue it left.
 */
export function flushAnswers(
  store: KeyValueStore,
  api: Pick<WorkerApi, 'answer'>,
  token: string,
): Promise<FlushResult> {
  const run = flushing.then(() => flushQueue(store, api, token));
  flushing = run.catch(() => undefined);
  return run;
}

async function flushQueue(
  store: KeyValueStore,
  api: Pick<WorkerApi, 'answer'>,
  token: string,
): Promise<FlushResult> {
  const queue = await loadAnswers(store);
  const result: FlushResult = { sent: [], refused: [], pending: [], signedOut: false };
  for (let index = 0; index < queue.length; index += 1) {
    const answer = queue[index]!;
    const outcome = workerAnswerOutcome(await api.answer(token, answer));
    if (outcome === 'sent') {
      result.sent.push(answer);
      continue;
    }
    if (outcome === 'refused') {
      result.refused.push(answer);
      continue;
    }
    result.signedOut = outcome === 'signed_out';
    result.pending = [
      { ...answer, attempts: answer.attempts + (outcome === 'retry' ? 1 : 0) },
      ...queue.slice(index + 1),
    ];
    break;
  }
  await saveAnswers(store, result.pending);
  return result;
}

const BACKGROUND_KEY = 'ota.worker.answers.background';

/** What background resends did while the worker was away, for the next open. */
export interface BackgroundReport {
  /** Offers whose answer the API took. */
  sent: string[];
  /** Answers the API refused. */
  refused: number;
}

async function loadReport(store: KeyValueStore): Promise<BackgroundReport> {
  const raw = await store.get(BACKGROUND_KEY);
  if (!raw) return { sent: [], refused: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<BackgroundReport>;
    return {
      sent: Array.isArray(parsed.sent) ? parsed.sent : [],
      refused: typeof parsed.refused === 'number' ? parsed.refused : 0,
    };
  } catch {
    return { sent: [], refused: 0 };
  }
}

/** Reads and clears what background resends did, so the app tells the worker once. */
export async function takeBackgroundReport(
  store: KeyValueStore,
): Promise<BackgroundReport> {
  const report = await loadReport(store);
  await store.remove(BACKGROUND_KEY);
  return report;
}

/**
 * The background task (spec §7.2): sends what waits, with no screen to show
 * the result on, so it adds the result to the report the app reads when it
 * next opens. With no session or an empty queue it makes no request. A
 * signed-out worker's answers stay until the next sign-in, as in the app.
 */
export async function resendInBackground(
  store: KeyValueStore,
  api: Pick<WorkerApi, 'answer'>,
  token: string | null,
): Promise<FlushResult | null> {
  if (!token || (await loadAnswers(store)).length === 0) return null;
  const result = await flushAnswers(store, api, token);
  if (result.sent.length > 0 || result.refused.length > 0) {
    const report = await loadReport(store);
    await store.set(
      BACKGROUND_KEY,
      JSON.stringify({
        sent: [...report.sent, ...result.sent.map((answer) => answer.serviceItemId)],
        refused: report.refused + result.refused.length,
      } satisfies BackgroundReport),
    );
  }
  return result;
}
