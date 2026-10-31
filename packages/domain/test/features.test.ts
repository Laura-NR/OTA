import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_OPERATING_THRESHOLDS,
  FEATURE_FLAGS,
  OPERATING_THRESHOLD_KEYS,
  changedThresholds,
  featureFlagsOf,
  railEnabled,
  railFeature,
  thresholdsIssues,
} from '../src';

describe('runtime feature flags (M9 D8b)', () => {
  it('carries every manifest flag in the settings document, with the manifest defaults', () => {
    for (const flag of FEATURE_FLAGS) {
      expect(OPERATING_THRESHOLD_KEYS).toContain(flag);
      expect(DEFAULT_OPERATING_THRESHOLDS[flag]).toBe(DEFAULT_FEATURE_FLAGS[flag]);
    }
    // Instant booking is the one flag a new agency starts without.
    expect(FEATURE_FLAGS.filter((flag) => !DEFAULT_FEATURE_FLAGS[flag])).toEqual([
      'instantBooking',
    ]);
  });

  it('reads only the flags out of a settings document', () => {
    const flags = featureFlagsOf({
      ...DEFAULT_OPERATING_THRESHOLDS,
      recruitmentPortal: false,
    });
    expect(Object.keys(flags)).toEqual([...FEATURE_FLAGS]);
    expect(flags.recruitmentPortal).toBe(false);
    expect(flags).not.toHaveProperty('dispatchTimeoutMinutes');
  });

  it('lets a proposal that only switches a flag through, and names the flag for the approver', () => {
    const next = { ...DEFAULT_OPERATING_THRESHOLDS, creditCardGatewayRail: false };
    expect(thresholdsIssues(next, DEFAULT_OPERATING_THRESHOLDS)).toEqual([]);
    expect(changedThresholds(DEFAULT_OPERATING_THRESHOLDS, next)).toEqual([
      'creditCardGatewayRail',
    ]);
  });

  it('opens the card rail with the card gateway flag and every other rail with the wire transfer flag', () => {
    expect(railFeature('CARD')).toBe('creditCardGatewayRail');
    expect(railFeature('OPEN_BANKING_SEPA')).toBe('directBankTransferRail');
    expect(railFeature('OTHER')).toBe('directBankTransferRail');

    const wireOff = { ...DEFAULT_FEATURE_FLAGS, directBankTransferRail: false };
    expect(railEnabled(wireOff, 'CARD')).toBe(true);
    expect(railEnabled(wireOff, 'OPEN_BANKING_SEPA')).toBe(false);
    expect(railEnabled(wireOff, 'OTHER')).toBe(false);

    const cardOff = { ...DEFAULT_FEATURE_FLAGS, creditCardGatewayRail: false };
    expect(railEnabled(cardOff, 'CARD')).toBe(false);
    expect(railEnabled(cardOff, 'OPEN_BANKING_SEPA')).toBe(true);
  });
});
