import { describe, expect, it } from 'vitest';

import { ApiError, createWorkerApi } from '../src/lib/api';

function recorder(status = 200, body: unknown = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}

describe('the worker app API client (W1, W3, W5)', () => {
  it('signs in by phone and code, then sends the token as a bearer token', async () => {
    const { calls, fetcher } = recorder(200, { token: 'abc.sig', expiresAt: 'x' });
    const api = createWorkerApi('http://api.test', fetcher);
    expect(await api.signIn('+5352410088', '123456')).toEqual({
      token: 'abc.sig',
      expiresAt: 'x',
    });
    await api.home('abc.sig');
    expect(calls[0]!.url).toBe('http://api.test/api/auth/sign-in/worker-code');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      phone: '+5352410088',
      code: '123456',
    });
    expect(calls[1]!.url).toBe('http://api.test/worker/home');
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer abc.sig',
    );
  });

  it('posts an accept or a decline with its reason, and reports the status', async () => {
    const { calls, fetcher } = recorder(409, { message: 'Offer is no longer open' });
    const api = createWorkerApi('', fetcher);
    const status = await api.answer('t', {
      serviceItemId: 'item-1',
      kind: 'decline',
      reason: 'Demasiado lejos para mí',
      answeredAt: 'x',
      attempts: 0,
    });
    expect(status).toBe(409);
    expect(calls[0]!.url).toBe('/service-items/item-1/decline');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      reason: 'Demasiado lejos para mí',
    });
  });

  it('reports no connection as a null status', async () => {
    const api = createWorkerApi('', (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch);
    expect(
      await api.answer('t', {
        serviceItemId: 'i',
        kind: 'accept',
        answeredAt: 'x',
        attempts: 0,
      }),
    ).toBeNull();
    await expect(api.home('t')).rejects.toMatchObject({ status: null });
    await expect(api.home('t')).rejects.toBeInstanceOf(ApiError);
  });
});
