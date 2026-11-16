import {
  queueJobAction,
  queueWorkerAnswer,
  queueWorkerMessage,
  workerAnswerOutcome,
  type JobAction,
  type WorkerAnswer,
  type WorkerAnswerOutcome,
  type WorkerMessageDraft,
} from '@ota/domain';

import type { WorkerApi } from './api';

/** The little the app keeps on the phone: SQLite on Android, localStorage on the web preview. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const QUEUE_KEY = 'ota.worker.answers';
/** W-Job's steps and emergency reports, beside the answers (spec §7.2). */
const JOBS_KEY = 'ota.worker.jobActions';
/** Messages to the desk written with no signal (`docs/schema-w-messages.md` M4). */
const MESSAGES_KEY = 'ota.worker.messages';

async function loadList<T>(store: KeyValueStore, key: string): Promise<T[]> {
  const raw = await store.get(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function saveList<T>(store: KeyValueStore, key: string, list: T[]): Promise<void> {
  if (list.length === 0) await store.remove(key);
  else await store.set(key, JSON.stringify(list));
}

export function loadAnswers(store: KeyValueStore): Promise<WorkerAnswer[]> {
  return loadList<WorkerAnswer>(store, QUEUE_KEY);
}

export function loadJobActions(store: KeyValueStore): Promise<JobAction[]> {
  return loadList<JobAction>(store, JOBS_KEY);
}

export function loadMessages(store: KeyValueStore): Promise<WorkerMessageDraft[]> {
  return loadList<WorkerMessageDraft>(store, MESSAGES_KEY);
}

/** Saves a message to the desk on the phone first (`queueWorkerMessage`). */
export async function saveMessage(
  store: KeyValueStore,
  draft: Omit<WorkerMessageDraft, 'attempts'>,
): Promise<WorkerMessageDraft[]> {
  const queue = queueWorkerMessage(await loadMessages(store), draft);
  await saveList(store, MESSAGES_KEY, queue);
  return queue;
}

/** Saves an answer on the phone first, replacing an unsent one for the same offer. */
export async function saveAnswer(
  store: KeyValueStore,
  answer: Omit<WorkerAnswer, 'attempts'>,
): Promise<WorkerAnswer[]> {
  const queue = queueWorkerAnswer(await loadAnswers(store), answer);
  await saveList(store, QUEUE_KEY, queue);
  return queue;
}

/**
 * A v4 UUID for an emergency report or a message, so a resent one is kept
 * once (J5, M4). It is
 * an idempotency key, not a secret: the phone's random source when it has one,
 * else `Math.random`.
 */
export function newClientRef(): string {
  const bytes = new Uint8Array(16);
  const source = (
    globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => void } }
  ).crypto;
  if (source?.getRandomValues) source.getRandomValues(bytes);
  else
    for (let index = 0; index < 16; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Saves a step or an emergency report on the phone first (`queueJobAction`). */
export async function saveJobAction(
  store: KeyValueStore,
  action: Parameters<typeof queueJobAction>[1],
): Promise<JobAction[]> {
  const queue = queueJobAction(await loadJobActions(store), action);
  await saveList(store, JOBS_KEY, queue);
  return queue;
}

/** What one list's sends came to. */
export interface ListFlush<T> {
  /** What the API took. */
  sent: T[];
  /** What the API refused (the offer or the job is no longer the worker's, or the step came too late). */
  refused: T[];
  /** Still waiting for a connection, oldest first. */
  pending: T[];
}

export interface FlushResult extends ListFlush<WorkerAnswer> {
  /** W-Job's steps and reports. */
  jobs: ListFlush<JobAction>;
  /** Messages to the desk. */
  messages: ListFlush<WorkerMessageDraft>;
  /** The session ended; the rest waits for the worker to sign in again. */
  signedOut: boolean;
}

type Stop = Exclude<WorkerAnswerOutcome, 'sent' | 'refused'> | null;

/**
 * Sends a list in order. It stops at the first item that gets no answer,
 * since the rest would fail the same way, and counts the try against it so
 * the next resend waits longer.
 */
async function sendInOrder<T extends { attempts: number }>(
  list: readonly T[],
  send: (item: T) => Promise<number | null>,
): Promise<ListFlush<T> & { stop: Stop }> {
  const result: ListFlush<T> = { sent: [], refused: [], pending: [] };
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index]!;
    const outcome = workerAnswerOutcome(await send(item));
    if (outcome === 'sent') {
      result.sent.push(item);
      continue;
    }
    if (outcome === 'refused') {
      result.refused.push(item);
      continue;
    }
    result.pending = [
      { ...item, attempts: item.attempts + (outcome === 'retry' ? 1 : 0) },
      ...list.slice(index + 1),
    ];
    return { ...result, stop: outcome };
  }
  return { ...result, stop: null };
}

/** The flush running now in this JavaScript runtime, if any. */
let flushing: Promise<unknown> = Promise.resolve();

/** What a flush sends with. */
type FlushApi = Pick<WorkerApi, 'answer' | 'jobAction' | 'sendMessage'>;

/**
 * Sends what waits on the phone (spec §7.2): emergency reports first, then the
 * offer answers, which have a deadline, then the messages to the desk, then
 * the job steps, which keep their own time. Each list goes in order; once one
 * item gets no answer, nothing after it is tried.
 *
 * One flush at a time: the background task can wake while the app is open
 * behind another app, and two flushes at once could send the same answer
 * twice, the API's refusal of the second reading as the offer having gone. A
 * flush asked for meanwhile starts when the current one ends and reads the
 * queue it left.
 */
export function flushAnswers(
  store: KeyValueStore,
  api: FlushApi,
  token: string,
): Promise<FlushResult> {
  const run = flushing.then(() => flushQueue(store, api, token));
  flushing = run.catch(() => undefined);
  return run;
}

async function flushQueue(
  store: KeyValueStore,
  api: FlushApi,
  token: string,
): Promise<FlushResult> {
  const [answers, actions, messages] = await Promise.all([
    loadAnswers(store),
    loadJobActions(store),
    loadMessages(store),
  ]);
  const sendAction = (action: JobAction) => api.jobAction(token, action);

  const reports = await sendInOrder(
    actions.filter((action) => action.kind === 'emergency'),
    sendAction,
  );
  const steps = actions.filter((action) => action.kind === 'step');
  const answered = reports.stop
    ? { sent: [], refused: [], pending: answers, stop: reports.stop }
    : await sendInOrder(answers, (answer) => api.answer(token, answer));
  const written = answered.stop
    ? { sent: [], refused: [], pending: messages, stop: answered.stop }
    : await sendInOrder(messages, (message) => api.sendMessage(token, message));
  const stepped = written.stop
    ? { sent: [], refused: [], pending: steps, stop: written.stop }
    : await sendInOrder(steps, sendAction);
  const stop = reports.stop ?? answered.stop ?? written.stop ?? stepped.stop;

  const result: FlushResult = {
    sent: answered.sent,
    refused: answered.refused,
    pending: answered.pending,
    jobs: {
      sent: [...reports.sent, ...stepped.sent],
      refused: [...reports.refused, ...stepped.refused],
      pending: [...reports.pending, ...stepped.pending],
    },
    messages: { sent: written.sent, refused: written.refused, pending: written.pending },
    signedOut: stop === 'signed_out',
  };
  await Promise.all([
    saveList(store, QUEUE_KEY, result.pending),
    saveList(store, JOBS_KEY, result.jobs.pending),
    saveList(store, MESSAGES_KEY, result.messages.pending),
  ]);
  return result;
}

/** Everything still waiting after a flush: what the sync chip counts. */
export function waiting(result: FlushResult): Array<{ attempts: number }> {
  return [...result.jobs.pending, ...result.pending, ...result.messages.pending];
}

const BACKGROUND_KEY = 'ota.worker.answers.background';

/** What background resends did while the worker was away, for the next open. */
export interface BackgroundReport {
  /** Offers whose answer the API took. */
  sent: string[];
  /** Answers the API refused. */
  refused: number;
  /** Job steps or reports the API refused. */
  jobsRefused: number;
  /** Messages to the desk the API refused. */
  messagesRefused: number;
}

const EMPTY_REPORT: BackgroundReport = {
  sent: [],
  refused: 0,
  jobsRefused: 0,
  messagesRefused: 0,
};

async function loadReport(store: KeyValueStore): Promise<BackgroundReport> {
  const raw = await store.get(BACKGROUND_KEY);
  if (!raw) return EMPTY_REPORT;
  try {
    const parsed = JSON.parse(raw) as Partial<BackgroundReport>;
    return {
      sent: Array.isArray(parsed.sent) ? parsed.sent : [],
      refused: typeof parsed.refused === 'number' ? parsed.refused : 0,
      jobsRefused: typeof parsed.jobsRefused === 'number' ? parsed.jobsRefused : 0,
      messagesRefused:
        typeof parsed.messagesRefused === 'number' ? parsed.messagesRefused : 0,
    };
  } catch {
    return EMPTY_REPORT;
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
 * next opens. With no session or nothing waiting it makes no request. A
 * signed-out worker's answers stay until the next sign-in, as in the app.
 */
export async function resendInBackground(
  store: KeyValueStore,
  api: FlushApi,
  token: string | null,
): Promise<FlushResult | null> {
  if (!token) return null;
  const [answers, actions, messages] = await Promise.all([
    loadAnswers(store),
    loadJobActions(store),
    loadMessages(store),
  ]);
  if (answers.length === 0 && actions.length === 0 && messages.length === 0) {
    return null;
  }
  const result = await flushAnswers(store, api, token);
  if (
    result.sent.length > 0 ||
    result.refused.length > 0 ||
    result.jobs.refused.length > 0 ||
    result.messages.refused.length > 0
  ) {
    const report = await loadReport(store);
    await store.set(
      BACKGROUND_KEY,
      JSON.stringify({
        sent: [...report.sent, ...result.sent.map((answer) => answer.serviceItemId)],
        refused: report.refused + result.refused.length,
        jobsRefused: report.jobsRefused + result.jobs.refused.length,
        messagesRefused: report.messagesRefused + result.messages.refused.length,
      } satisfies BackgroundReport),
    );
  }
  return result;
}
