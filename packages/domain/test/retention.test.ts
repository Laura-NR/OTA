import { describe, expect, it } from 'vitest';

import {
  RETENTION_GRACE_DAYS,
  addMonths,
  isRetentionNoticeDue,
  isRetentionPurgeDue,
  retentionPurgeAt,
  retentionStatus,
  type RetentionClock,
} from '../src';

const emptyClock: RetentionClock = {
  latestCompletedAt: null,
  noticeSentAt: null,
  consentGrantedAt: null,
  anonymizedAt: null,
};

describe('retention clock', () => {
  it('clamps calendar-month addition to the target month length', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });

  it('sends the notice exactly six months after the latest completion', () => {
    const clock = {
      ...emptyClock,
      latestCompletedAt: new Date('2026-01-10T09:00:00Z'),
    };

    expect(isRetentionNoticeDue(clock, new Date('2026-07-09T09:00:00Z'))).toBe(false);
    expect(isRetentionNoticeDue(clock, new Date('2026-07-10T09:00:00Z'))).toBe(true);
  });

  it('never sends a notice without a completion, or after anonymization', () => {
    expect(isRetentionNoticeDue(emptyClock, new Date('2030-01-01T00:00:00Z'))).toBe(
      false,
    );
    expect(
      isRetentionNoticeDue(
        {
          ...emptyClock,
          latestCompletedAt: new Date('2020-01-01T00:00:00Z'),
          anonymizedAt: new Date('2020-08-01T00:00:00Z'),
        },
        new Date('2030-01-01T00:00:00Z'),
      ),
    ).toBe(false);
  });

  it('does not resend a notice within the same cycle', () => {
    const clock = {
      ...emptyClock,
      latestCompletedAt: new Date('2026-01-10T00:00:00Z'),
      noticeSentAt: new Date('2026-07-10T00:00:00Z'),
    };

    expect(isRetentionNoticeDue(clock, new Date('2026-08-01T00:00:00Z'))).toBe(false);
  });

  it('extends the account 12 months after a confirmation', () => {
    const clock = {
      ...emptyClock,
      latestCompletedAt: new Date('2026-01-10T00:00:00Z'),
      noticeSentAt: new Date('2026-07-10T00:00:00Z'),
      consentGrantedAt: new Date('2026-07-20T00:00:00Z'),
    };

    expect(isRetentionNoticeDue(clock, new Date('2027-06-01T00:00:00Z'))).toBe(false);
    expect(isRetentionNoticeDue(clock, new Date('2027-07-20T00:00:00Z'))).toBe(true);
  });
});

describe('retention purge', () => {
  const noticeSentAt = new Date('2026-07-10T00:00:00Z');

  it('is due 30 days after the notice when consent was never granted', () => {
    const clock = { ...emptyClock, noticeSentAt };

    expect(retentionPurgeAt(noticeSentAt).toISOString()).toBe('2026-08-09T00:00:00.000Z');
    expect(isRetentionPurgeDue(clock, new Date('2026-08-08T23:59:00Z'))).toBe(false);
    expect(isRetentionPurgeDue(clock, new Date('2026-08-09T00:00:00Z'))).toBe(true);
  });

  it('is cancelled by a confirmation after the notice', () => {
    const clock = {
      ...emptyClock,
      noticeSentAt,
      consentGrantedAt: new Date('2026-07-20T00:00:00Z'),
    };

    expect(isRetentionPurgeDue(clock, new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });

  it('uses exactly the 30-day grace window', () => {
    expect(RETENTION_GRACE_DAYS).toBe(30);
  });
});

describe('retentionStatus', () => {
  it('labels each lifecycle stage', () => {
    expect(retentionStatus(emptyClock, new Date())).toBe('ACTIVE');
    expect(
      retentionStatus(
        { ...emptyClock, latestCompletedAt: new Date('2020-01-01T00:00:00Z') },
        new Date('2026-01-01T00:00:00Z'),
      ),
    ).toBe('NOTICE_DUE');
    expect(
      retentionStatus(
        { ...emptyClock, noticeSentAt: new Date('2026-01-01T00:00:00Z') },
        new Date('2026-01-10T00:00:00Z'),
      ),
    ).toBe('GRACE_PERIOD');
    expect(
      retentionStatus(
        { ...emptyClock, noticeSentAt: new Date('2026-01-01T00:00:00Z') },
        new Date('2026-03-01T00:00:00Z'),
      ),
    ).toBe('PURGE_DUE');
    expect(
      retentionStatus(
        { ...emptyClock, anonymizedAt: new Date('2026-03-01T00:00:00Z') },
        new Date('2026-03-02T00:00:00Z'),
      ),
    ).toBe('ANONYMIZED');
  });
});
