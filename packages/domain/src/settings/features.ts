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
  'aiAssistant',
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
  aiAssistant: true,
};

/** Only the flags, from a settings document that carries them among other values. */
export function featureFlagsOf(values: FeatureFlagValues): FeatureFlagValues {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag, values[flag]]),
  ) as FeatureFlagValues;
}

/** What the deployment, not the settings, says about a flag (A4, 2026-11-09). */
export interface FeatureDeployment {
  production: boolean;
  /** The assistant runs on the mock model, which only returns canned text. */
  aiProviderIsMock: boolean;
}

/**
 * The flags a deployment holds off whatever the settings say: the AI
 * assistant in production while its provider is the mock, so canned drafts
 * never reach a launch even if nobody switches the flag off.
 */
export function heldOffFeatures(deployment: FeatureDeployment): FeatureFlag[] {
  return deployment.production && deployment.aiProviderIsMock ? ['aiAssistant'] : [];
}

/** The flags in force: the settings' values, less what the deployment holds off. */
export function featuresInForce(
  flags: FeatureFlagValues,
  heldOff: readonly FeatureFlag[],
): FeatureFlagValues {
  return Object.fromEntries(
    FEATURE_FLAGS.map((flag) => [flag, flags[flag] && !heldOff.includes(flag)]),
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
