/**
 * Runtime feature flags (M9 D8b, chosen 2026-10-31). The manifest's
 * `features` are the defaults; an applied operating-settings version may
 * switch them, proposed by one Super Admin and applied by a second, like the
 * thresholds. Switching a flag off stops what it covers in the API, not only
 * on the pages.
 */

/** The manifest's flags, in its order. */
export const FEATURE_FLAGS = [
  'interactiveSvgMap',
  'culturalEventsBanner',
  'recruitmentPortal',
  'customItineraryBuilder',
  'instantBooking',
  'directBankTransferRail',
  'creditCardGatewayRail',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type FeatureFlagValues = Record<FeatureFlag, boolean>;

/** The manifest schema's own defaults, for a document read without a manifest. */
export const DEFAULT_FEATURE_FLAGS: FeatureFlagValues = {
  interactiveSvgMap: true,
  culturalEventsBanner: true,
  recruitmentPortal: true,
  customItineraryBuilder: true,
  instantBooking: false,
  directBankTransferRail: true,
  creditCardGatewayRail: true,
};

/** Only the flags, from a settings document that carries them among other values. */
export function featureFlagsOf(values: FeatureFlagValues): FeatureFlagValues {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag, values[flag]]),
  ) as FeatureFlagValues;
}

export type FeatureRail = 'OPEN_BANKING_SEPA' | 'CARD' | 'OTHER';

/**
 * The flag that opens a payment rail: the card gateway for cards, the wire
 * transfer for the rest (`OTHER` is paid by transfer too, ADR 0005).
 */
export function railFeature(rail: FeatureRail): FeatureFlag {
  return rail === 'CARD' ? 'creditCardGatewayRail' : 'directBankTransferRail';
}

export function railEnabled(flags: FeatureFlagValues, rail: FeatureRail): boolean {
  return flags[railFeature(rail)];
}
