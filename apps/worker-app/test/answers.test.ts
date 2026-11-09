import { describe, expect, it } from 'vitest';

import {
  flushAnswers,
  loadAnswers,
  saveAnswer,
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
