import { describe, expect, it } from 'vitest';

import {
  flushAnswers,
  loadAnswers,
  resendInBackground,
  saveAnswer,
  takeBackgroundReport,
  type KeyValueStore,
} from '../src/lib/answers';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    remove: async (key) => {
      data.delete(key);
    },
  };
}

const AT = '2026-11-09T10:00:00.000Z';

describe('answers saved on the phone (docs/worker-app-plan.md W6)', () => {
  it('keeps an answer until the API takes it, in the order given', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    await saveAnswer(store, {
      serviceItemId: 'b',
      kind: 'decline',
      reason: 'Problema con el vehículo',
      answeredAt: AT,
    });
    const calls: string[] = [];
    const result = await flushAnswers(
      store,
      {
        answer: async (_token, answer) => {
          calls.push(`${answer.kind}:${answer.serviceItemId}`);
          return 200;
        },
      },
      'token',
    );
    expect(calls).toEqual(['accept:a', 'decline:b']);
    expect(result.sent.map((answer) => answer.serviceItemId)).toEqual(['a', 'b']);
    expect(result.pending).toEqual([]);
    expect(await loadAnswers(store)).toEqual([]);
  });

  it('stops at the first answer with no connection and counts the try', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    await saveAnswer(store, { serviceItemId: 'b', kind: 'accept', answeredAt: AT });
    let calls = 0;
    const result = await flushAnswers(
      store,
      {
        answer: async () => {
          calls += 1;
          return null;
        },
      },
      'token',
    );
    expect(calls).toBe(1);
    expect(
      result.pending.map((answer) => [answer.serviceItemId, answer.attempts]),
    ).toEqual([
      ['a', 1],
      ['b', 0],
    ]);
    expect(await loadAnswers(store)).toEqual(result.pending);
  });

  it('drops an answer the API refused and tells the worker', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'late', kind: 'accept', answeredAt: AT });
    await saveAnswer(store, { serviceItemId: 'b', kind: 'accept', answeredAt: AT });
    const result = await flushAnswers(
      store,
      { answer: async (_token, answer) => (answer.serviceItemId === 'late' ? 409 : 200) },
      'token',
    );
    expect(result.refused.map((answer) => answer.serviceItemId)).toEqual(['late']);
    expect(result.sent.map((answer) => answer.serviceItemId)).toEqual(['b']);
    expect(await loadAnswers(store)).toEqual([]);
  });

  it('keeps everything, uncounted, when the session has ended', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    const result = await flushAnswers(store, { answer: async () => 401 }, 'token');
    expect(result.signedOut).toBe(true);
    expect(result.pending).toEqual([
      { serviceItemId: 'a', kind: 'accept', answeredAt: AT, attempts: 0 },
    ]);
  });

  it('reads a damaged queue as empty rather than failing', async () => {
    const store = memoryStore();
    store.data.set('ota.worker.answers', '{not json');
    expect(await loadAnswers(store)).toEqual([]);
  });
});

describe('resending with the app closed (spec §7.2)', () => {
  it('sends each answer once when the background and the app flush together', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    await saveAnswer(store, { serviceItemId: 'b', kind: 'accept', answeredAt: AT });
    const calls: string[] = [];
    const api = {
      answer: async (_token: string, answer: { serviceItemId: string }) => {
        calls.push(answer.serviceItemId);
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 200;
      },
    };
    const [background, foreground] = await Promise.all([
      resendInBackground(store, api, 'token'),
      flushAnswers(store, api, 'token'),
    ]);
    expect(calls).toEqual(['a', 'b']);
    expect(
      [...(background?.sent ?? []), ...foreground.sent].map(
        (answer) => answer.serviceItemId,
      ),
    ).toEqual(['a', 'b']);
    expect(await loadAnswers(store)).toEqual([]);
  });

  it('makes no request without a session or with nothing to send', async () => {
    const store = memoryStore();
    let calls = 0;
    const api = {
      answer: async () => {
        calls += 1;
        return 200;
      },
    };
    expect(await resendInBackground(store, api, 'token')).toBeNull();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    expect(await resendInBackground(store, api, null)).toBeNull();
    expect(calls).toBe(0);
    expect(await loadAnswers(store)).toHaveLength(1);
  });

  it('tells the app once what the background sent and refused', async () => {
    const store = memoryStore();
    const statuses: Record<string, number> = { a: 200, b: 409, c: 200 };
    const api = {
      answer: async (_token: string, answer: { serviceItemId: string }) =>
        statuses[answer.serviceItemId]!,
    };
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    await saveAnswer(store, { serviceItemId: 'b', kind: 'accept', answeredAt: AT });
    await resendInBackground(store, api, 'token');
    await saveAnswer(store, { serviceItemId: 'c', kind: 'accept', answeredAt: AT });
    await resendInBackground(store, api, 'token');
    expect(await takeBackgroundReport(store)).toEqual({ sent: ['a', 'c'], refused: 1 });
    expect(await takeBackgroundReport(store)).toEqual({ sent: [], refused: 0 });
  });

  it('keeps the answers of a signed-out worker and reports nothing', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    const result = await resendInBackground(store, { answer: async () => 401 }, 'token');
    expect(result?.signedOut).toBe(true);
    expect(await loadAnswers(store)).toHaveLength(1);
    expect(await takeBackgroundReport(store)).toEqual({ sent: [], refused: 0 });
  });
});
