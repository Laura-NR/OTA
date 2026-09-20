import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DISPATCH_TIMEOUT_MS,
  SHORT_NOTICE_DISPATCH_TIMEOUT_MS,
  escalationAlert,
  resolveDispatchTimeoutMs,
} from '../src';

const NOW = new Date('2026-09-20T12:00:00Z');

function hours(n: number): number {
  return n * 60 * 60 * 1000;
}

describe('resolveDispatchTimeoutMs', () => {
  it('uses 2 hours for a booking well ahead of arrival', () => {
    const arrivalAt = new Date(NOW.getTime() + hours(24 * 7));
    expect(resolveDispatchTimeoutMs({ now: NOW, arrivalAt })).toBe(
      DEFAULT_DISPATCH_TIMEOUT_MS,
    );
  });

  it('uses 30 minutes under the 48 hour short-notice window', () => {
    const arrivalAt = new Date(NOW.getTime() + hours(24));
    expect(resolveDispatchTimeoutMs({ now: NOW, arrivalAt })).toBe(
      SHORT_NOTICE_DISPATCH_TIMEOUT_MS,
    );
  });
});

describe('escalationAlert', () => {
  const offeredAt = NOW;
  const deadline = new Date(NOW.getTime() + hours(2));

  it('is silent early in the window', () => {
    const now = new Date(NOW.getTime() + hours(1)); // 50%
    expect(escalationAlert({ offeredAt, deadline, now })).toBe('NONE');
  });

  it('turns amber at 75% elapsed', () => {
    const now = new Date(NOW.getTime() + hours(1.5));
    expect(escalationAlert({ offeredAt, deadline, now })).toBe('AMBER');
  });

  it('turns red at 100% elapsed', () => {
    const now = new Date(deadline.getTime());
    expect(escalationAlert({ offeredAt, deadline, now })).toBe('RED');
  });

  it('is immediately red when a worker declines', () => {
    expect(escalationAlert({ offeredAt, deadline, now: offeredAt, declined: true })).toBe(
      'RED',
    );
  });

  it('is red when the deadline is already in the past', () => {
    const now = new Date(deadline.getTime() + hours(1));
    expect(escalationAlert({ offeredAt, deadline, now })).toBe('RED');
  });
});
