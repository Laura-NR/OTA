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

/**
 * Sends the queued answers in order (spec §7.2). It stops at the first one
 * that gets no answer, since the rest would fail the same way, and counts the
 * try against it so the next resend waits longer.
 */
export async function flushAnswers(
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
