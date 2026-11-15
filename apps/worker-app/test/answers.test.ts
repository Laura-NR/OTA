import { describe, expect, it } from 'vitest';

import type { JobAction } from '@ota/domain';

import {
  flushAnswers,
  loadAnswers,
  loadJobActions,
  newClientRef,
  resendInBackground,
  saveAnswer,
  saveJobAction,
  takeBackgroundReport,
  waiting,
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

/** For a test with no job action queued: one sent would be a bug. */
const noJobs = async (): Promise<number | null> => {
  throw new Error('no job action is queued');
};

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
        jobAction: noJobs,
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
        jobAction: noJobs,
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
      {
        answer: async (_token, answer) => (answer.serviceItemId === 'late' ? 409 : 200),
        jobAction: noJobs,
      },
      'token',
    );
    expect(result.refused.map((answer) => answer.serviceItemId)).toEqual(['late']);
    expect(result.sent.map((answer) => answer.serviceItemId)).toEqual(['b']);
    expect(await loadAnswers(store)).toEqual([]);
  });

  it('keeps everything, uncounted, when the session has ended', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    const result = await flushAnswers(
      store,
      { answer: async () => 401, jobAction: noJobs },
      'token',
    );
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
      jobAction: noJobs,
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
      jobAction: noJobs,
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
      jobAction: noJobs,
    };
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    await saveAnswer(store, { serviceItemId: 'b', kind: 'accept', answeredAt: AT });
    await resendInBackground(store, api, 'token');
    await saveAnswer(store, { serviceItemId: 'c', kind: 'accept', answeredAt: AT });
    await resendInBackground(store, api, 'token');
    expect(await takeBackgroundReport(store)).toEqual({
      sent: ['a', 'c'],
      refused: 1,
      jobsRefused: 0,
    });
    expect(await takeBackgroundReport(store)).toEqual({
      sent: [],
      refused: 0,
      jobsRefused: 0,
    });
  });

  it('keeps the answers of a signed-out worker and reports nothing', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'a', kind: 'accept', answeredAt: AT });
    const result = await resendInBackground(
      store,
      { answer: async () => 401, jobAction: noJobs },
      'token',
    );
    expect(result?.signedOut).toBe(true);
    expect(await loadAnswers(store)).toHaveLength(1);
    expect(await takeBackgroundReport(store)).toEqual({
      sent: [],
      refused: 0,
      jobsRefused: 0,
    });
  });
});

describe("a job's steps and emergency reports on the phone (W-Job, spec §7.2)", () => {
  const step = (serviceItemId: string, name: 'EN_ROUTE' | 'ARRIVED') =>
    ({ kind: 'step', serviceItemId, step: name, occurredAt: AT }) as const;
  const report = {
    kind: 'emergency',
    serviceItemId: 'job',
    clientRef: 'ref-1',
    category: 'MEDICAL',
    occurredAt: AT,
    position: { latitude: 23.1, longitude: -82.3, accuracyM: 10 },
  } as const;
  const label = (action: JobAction) =>
    action.kind === 'step' ? `step:${action.step}` : `sos:${action.clientRef}`;

  it('sends an emergency report first, then the answers, then the steps', async () => {
    const store = memoryStore();
    await saveJobAction(store, step('job', 'EN_ROUTE'));
    await saveAnswer(store, { serviceItemId: 'offer', kind: 'accept', answeredAt: AT });
    await saveJobAction(store, report);
    const calls: string[] = [];
    const result = await flushAnswers(
      store,
      {
        answer: async (_token, answer) => {
          calls.push(`answer:${answer.serviceItemId}`);
          return 200;
        },
        jobAction: async (_token, action) => {
          calls.push(label(action));
          return 200;
        },
      },
      'token',
    );
    expect(calls).toEqual(['sos:ref-1', 'answer:offer', 'step:EN_ROUTE']);
    expect(result.jobs.sent.map(label)).toEqual(['sos:ref-1', 'step:EN_ROUTE']);
    expect(await loadJobActions(store)).toEqual([]);
  });

  it('tries nothing after a report that got no answer, and keeps it all', async () => {
    const store = memoryStore();
    await saveAnswer(store, { serviceItemId: 'offer', kind: 'accept', answeredAt: AT });
    await saveJobAction(store, report);
    await saveJobAction(store, step('job', 'ARRIVED'));
    const result = await flushAnswers(
      store,
      { answer: noJobs, jobAction: async () => null },
      'token',
    );
    expect(result.jobs.pending.map((action) => [label(action), action.attempts])).toEqual(
      [
        ['sos:ref-1', 1],
        ['step:ARRIVED', 0],
      ],
    );
    expect(result.pending).toHaveLength(1);
    expect(waiting(result)).toHaveLength(3);
  });

  it('gives each emergency report its own v4 id, which the API takes as a uuid', () => {
    const refs = new Set(Array.from({ length: 50 }, newClientRef));
    expect(refs.size).toBe(50);
    for (const ref of refs) {
      expect(ref).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it('drops a step the API refused and reports it from the background', async () => {
    const store = memoryStore();
    await saveJobAction(store, step('job', 'EN_ROUTE'));
    const result = await resendInBackground(
      store,
      { answer: noJobs, jobAction: async () => 409 },
      'token',
    );
    expect(result?.jobs.refused.map(label)).toEqual(['step:EN_ROUTE']);
    expect(await loadJobActions(store)).toEqual([]);
    expect((await takeBackgroundReport(store)).jobsRefused).toBe(1);
  });
});
