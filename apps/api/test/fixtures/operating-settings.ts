import {
  DEFAULT_OPERATING_THRESHOLDS,
  dispatchTimerPolicy,
  type OperatingThresholds,
} from '@ota/domain';

import type { OperatingSettingsService } from '../../src/settings/operating-settings.service';

/**
 * The M9 settings service for tests that build services by hand: the code's
 * defaults, optionally changed.
 */
export function fakeOperatingSettings(
  overrides: Partial<OperatingThresholds> = {},
): OperatingSettingsService {
  const values: OperatingThresholds = { ...DEFAULT_OPERATING_THRESHOLDS, ...overrides };
  return {
    defaults: () => values,
    thresholds: async () => values,
    dispatchTimers: async () => dispatchTimerPolicy(values),
    retentionPolicy: async () => ({
      triggerMonths: values.retentionTriggerMonths,
      graceDays: values.retentionGraceDays,
    }),
  } as unknown as OperatingSettingsService;
}

/**
 * Adds the M9 tables to an in-memory Prisma fake: no applied settings
 * version (so the real service runs on the defaults merged from the tenant
 * manifest) and no staff invitations.
 */
export function withNoSettingsVersion<T extends object>(prisma: T): T {
  return Object.assign(prisma, {
    operatingSettings: { findFirst: async () => null },
    staffInvite: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
  });
}
