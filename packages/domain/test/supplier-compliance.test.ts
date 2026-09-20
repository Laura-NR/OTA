import { describe, expect, it } from 'vitest';

import {
  VerificationStatus,
  canAutoDispatch,
  coversProvince,
  isCredentialExpiringSoon,
} from '../src';

const NOW = new Date('2026-09-20T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function days(n: number): Date {
  return new Date(NOW.getTime() + n * DAY_MS);
}

const eligible = {
  verificationStatus: VerificationStatus.Verified,
  isAvailable: true,
  credentialExpiresAt: days(365),
};

describe('isCredentialExpiringSoon', () => {
  it('flags expiry inside 30 days', () => {
    expect(isCredentialExpiringSoon(days(10), NOW)).toBe(true);
  });

  it('does not flag expiry well beyond 30 days', () => {
    expect(isCredentialExpiringSoon(days(90), NOW)).toBe(false);
  });

  it('flags an already expired credential', () => {
    expect(isCredentialExpiringSoon(days(-1), NOW)).toBe(true);
  });
});

describe('canAutoDispatch', () => {
  it('allows a verified, available, unexpiring worker', () => {
    expect(canAutoDispatch(eligible, NOW)).toBe(true);
  });

  it('blocks a worker who is not VERIFIED', () => {
    expect(
      canAutoDispatch(
        { ...eligible, verificationStatus: VerificationStatus.PendingAudit },
        NOW,
      ),
    ).toBe(false);
  });

  it('blocks an unavailable worker', () => {
    expect(canAutoDispatch({ ...eligible, isAvailable: false }, NOW)).toBe(false);
  });

  it('blocks a worker whose credential expires within 30 days', () => {
    expect(canAutoDispatch({ ...eligible, credentialExpiresAt: days(15) }, NOW)).toBe(
      false,
    );
  });

  it('allows a worker with no tracked credential expiry', () => {
    expect(canAutoDispatch({ ...eligible, credentialExpiresAt: null }, NOW)).toBe(true);
  });
});

describe('coversProvince', () => {
  it('matches any supplier when no province is required', () => {
    expect(coversProvince(['La Habana'], null)).toBe(true);
    expect(coversProvince([], undefined)).toBe(true);
  });

  it('requires the province to be in the active list', () => {
    expect(coversProvince(['La Habana', 'Matanzas'], 'Matanzas')).toBe(true);
    expect(coversProvince(['La Habana'], 'Matanzas')).toBe(false);
  });
});
