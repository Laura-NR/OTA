import type { NextFunction, Request, Response } from 'express';

export type RateLimitBucket = 'auth' | 'default';

export interface RateLimitRule {
  max: number;
}

export interface RateLimitOptions {
  /** Length of the fixed window in milliseconds. */
  windowMs: number;
  /** Requests allowed per window for a normal client. */
  max: number;
  /** Requests allowed per window for authentication routes. */
  authMax: number;
  /** Paths that are never limited (e.g. readiness probes). */
  skip?: (path: string) => boolean;
  /** Injectable clock, for tests. */
  now?: () => number;
  /** Injectable client key, for tests. Defaults to the request IP. */
  keyGenerator?: (req: Request) => string;
  /** Sweep interval in milliseconds; defaults to the window length. */
  sweepIntervalMs?: number;
}

export interface RateLimiter {
  middleware: (req: Request, res: Response, next: NextFunction) => void;
  /** Drop expired counters; returns the number still tracked. */
  sweep: (at?: number) => number;
  /** Clear all counters (tests). */
  reset: () => void;
  /** Stop the background sweep (tests / shutdown). */
  close: () => void;
}

interface Counter {
  count: number;
  resetAt: number;
}

/**
 * Credential-bearing auth routes get the stricter limit. Session reads
 * (`/api/auth/get-session`, `/api/auth/ok`) are hit on every page load and use
 * the normal limit — throttling them would break normal browsing.
 */
const SENSITIVE_AUTH_PREFIXES = [
  '/api/auth/sign-in',
  '/api/auth/sign-up',
  '/api/auth/magic-link',
  '/api/auth/callback',
  '/api/auth/forget-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/request-password-reset',
];

function bucketFor(path: string): RateLimitBucket {
  return SENSITIVE_AUTH_PREFIXES.some((prefix) => path.startsWith(prefix))
    ? 'auth'
    : 'default';
}

function clientKey(req: Request, keyGenerator?: (req: Request) => string): string {
  if (keyGenerator) {
    return keyGenerator(req);
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}

/**
 * A dependency-free, in-memory fixed-window rate limiter. Mounted as Express
 * middleware (not a Nest guard) in `main.ts` so it also covers the Better Auth
 * routes, which are handled before Nest. Limits are per process: a multi-instance
 * deployment needs a shared store (see the runbook).
 */
export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const now = options.now ?? Date.now;
  const counters = new Map<string, Counter>();
  const limitFor = (bucket: RateLimitBucket): number =>
    bucket === 'auth' ? options.authMax : options.max;

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path ?? req.url ?? '/';
    if (options.skip?.(path)) {
      next();
      return;
    }

    const at = now();
    const bucket = bucketFor(path);
    const limit = limitFor(bucket);
    const key = `${clientKey(req, options.keyGenerator)}:${bucket}`;

    let counter = counters.get(key);
    if (!counter || counter.resetAt <= at) {
      counter = { count: 0, resetAt: at + options.windowMs };
      counters.set(key, counter);
    }
    counter.count += 1;

    const remaining = Math.max(0, limit - counter.count);
    const resetSeconds = Math.max(1, Math.ceil((counter.resetAt - at) / 1000));
    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (counter.count > limit) {
      res.setHeader('Retry-After', String(resetSeconds));
      res.status(429).json({ statusCode: 429, message: 'Too many requests' });
      return;
    }

    next();
  };

  const sweep = (at: number = now()): number => {
    for (const [key, counter] of counters) {
      if (counter.resetAt <= at) {
        counters.delete(key);
      }
    }
    return counters.size;
  };

  const interval = setInterval(
    () => sweep(),
    options.sweepIntervalMs ?? options.windowMs,
  );
  // Do not keep the process alive just for the sweep.
  interval.unref?.();

  return {
    middleware,
    sweep,
    reset: () => counters.clear(),
    close: () => clearInterval(interval),
  };
}
