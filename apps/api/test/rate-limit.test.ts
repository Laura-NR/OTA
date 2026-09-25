import type { Request, Response } from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { createRateLimiter, type RateLimiter } from '../src/common/rate-limit';

function makeReq(path: string, ip = '1.2.3.4'): Request {
  return { path, ip, socket: { remoteAddress: ip } } as unknown as Request;
}

function makeRes(): {
  res: Response;
  state: { statusCode: number; body: unknown; headers: Record<string, string> };
} {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
  };
  const res = {
    setHeader(name: string, value: string) {
      state.headers[name] = String(value);
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  } as unknown as Response;
  return { res, state };
}

const open: RateLimiter[] = [];

function build(options: Parameters<typeof createRateLimiter>[0]): RateLimiter {
  const limiter = createRateLimiter(options);
  open.push(limiter);
  return limiter;
}

function hit(limiter: RateLimiter, path = '/reservations', ip = '1.2.3.4') {
  const { res, state } = makeRes();
  let next = false;
  limiter.middleware(makeReq(path, ip), res, () => {
    next = true;
  });
  return { ...state, next };
}

afterEach(() => {
  while (open.length > 0) {
    open.pop()?.close();
  }
});

describe('createRateLimiter', () => {
  it('allows requests up to the limit then returns 429', () => {
    const limiter = build({ windowMs: 60_000, max: 3, authMax: 1 });

    expect(hit(limiter).next).toBe(true);
    expect(hit(limiter).next).toBe(true);
    const third = hit(limiter);
    expect(third.next).toBe(true);
    expect(third.headers['X-RateLimit-Remaining']).toBe('0');

    const fourth = hit(limiter);
    expect(fourth.next).toBe(false);
    expect(fourth.statusCode).toBe(429);
    expect(fourth.headers['Retry-After']).toBeDefined();
  });

  it('resets once the window elapses', () => {
    let now = 1_000_000;
    const limiter = build({
      windowMs: 60_000,
      max: 1,
      authMax: 1,
      now: () => now,
    });

    expect(hit(limiter).next).toBe(true);
    expect(hit(limiter).next).toBe(false);

    now += 60_000;
    expect(hit(limiter).next).toBe(true);
  });

  it('applies the stricter limit only to credential endpoints', () => {
    const limiter = build({ windowMs: 60_000, max: 10, authMax: 1 });

    expect(hit(limiter, '/api/auth/sign-in/magic-link').next).toBe(true);
    expect(hit(limiter, '/api/auth/sign-in/magic-link').next).toBe(false);

    // Session reads use the normal limit and are not throttled by the auth burst.
    expect(hit(limiter, '/api/auth/get-session').next).toBe(true);
    expect(hit(limiter, '/api/auth/get-session').next).toBe(true);
  });

  it('keys counters by client', () => {
    const limiter = build({ windowMs: 60_000, max: 1, authMax: 1 });

    expect(hit(limiter, '/x', '1.1.1.1').next).toBe(true);
    expect(hit(limiter, '/x', '1.1.1.1').next).toBe(false);
    expect(hit(limiter, '/x', '2.2.2.2').next).toBe(true);
  });

  it('never limits skipped paths', () => {
    const limiter = build({
      windowMs: 60_000,
      max: 1,
      authMax: 1,
      skip: (path) => path.startsWith('/health'),
    });

    for (let i = 0; i < 5; i += 1) {
      expect(hit(limiter, '/health/ready').next).toBe(true);
    }
  });

  it('sweeps expired counters', () => {
    let now = 1_000_000;
    const limiter = build({
      windowMs: 60_000,
      max: 5,
      authMax: 5,
      now: () => now,
    });

    hit(limiter);
    expect(limiter.sweep()).toBe(1);
    now += 60_000;
    expect(limiter.sweep()).toBe(0);
  });
});
