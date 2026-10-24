/**
 * Display preferences kept on the traveler's device (Account board,
 * "Accessibility & data"; DS 05 text-only mode). They live in one first-party
 * cookie the storefront's server reads, so a page renders in the chosen mode
 * from its first byte and signed-out visitors can use them too. They are not
 * account data and never reach the API.
 */
export const DISPLAY_COOKIE = 'ota_display';

export interface DisplayPreferences {
  /** Larger text: 18 px body instead of 16 px, everything set in rem with it. */
  largeText: boolean;
  /** Low-bandwidth mode: text first, photos on tap, system fonts, no video. */
  lowBandwidth: boolean;
  /** The traveler said "not now" to the slow-connection prompt. */
  bandwidthPromptDismissed: boolean;
}

export const DEFAULT_DISPLAY_PREFERENCES: Readonly<DisplayPreferences> = {
  largeText: false,
  lowBandwidth: false,
  bandwidthPromptDismissed: false,
};

/** Each preference's token in the cookie value; tokens are joined by ".". */
const FLAGS: Readonly<Record<keyof DisplayPreferences, string>> = {
  largeText: 'large-text',
  lowBandwidth: 'low-bandwidth',
  bandwidthPromptDismissed: 'no-prompt',
};

/** The preferences in a cookie value; unknown tokens are ignored. */
export function parseDisplayPreferences(
  value: string | null | undefined,
): DisplayPreferences {
  const tokens = new Set((value ?? '').split('.').map((token) => token.trim()));
  return {
    largeText: tokens.has(FLAGS.largeText),
    lowBandwidth: tokens.has(FLAGS.lowBandwidth),
    bandwidthPromptDismissed: tokens.has(FLAGS.bandwidthPromptDismissed),
  };
}

/** The cookie value for `preferences`; empty when every preference is off. */
export function serializeDisplayPreferences(preferences: DisplayPreferences): string {
  return (Object.keys(FLAGS) as Array<keyof DisplayPreferences>)
    .filter((key) => preferences[key])
    .map((key) => FLAGS[key])
    .join('.');
}

/** DS 05: text-only mode is offered under 200 kbps. */
export const SLOW_CONNECTION_KBPS = 200;

/** What the browser says about the connection (the Network Information API). */
export interface ConnectionHint {
  /** The reader asked the browser to save data. */
  saveData?: boolean;
  /** Estimated bandwidth in Mbps; 0 means unknown (or offline). */
  downlinkMbps?: number;
  /** `slow-2g`, `2g`, `3g` or `4g`. */
  effectiveType?: string;
}

/**
 * Whether the connection is slow enough to offer text-only mode: the reader
 * asked to save data, the estimate is under 200 kbps, or the browser rates it
 * 2G. A browser that says nothing is not slow.
 */
export function isSlowConnection(hint: ConnectionHint | null | undefined): boolean {
  if (!hint) {
    return false;
  }
  if (hint.saveData === true) {
    return true;
  }
  if (hint.effectiveType === 'slow-2g' || hint.effectiveType === '2g') {
    return true;
  }
  const downlink = hint.downlinkMbps;
  return (
    typeof downlink === 'number' && downlink > 0 && downlink * 1000 < SLOW_CONNECTION_KBPS
  );
}

/** Offer text-only mode once: on a slow connection, unless on or declined. */
export function offersLowBandwidthMode(
  preferences: DisplayPreferences,
  hint: ConnectionHint | null | undefined,
): boolean {
  return (
    !preferences.lowBandwidth &&
    !preferences.bandwidthPromptDismissed &&
    isSlowConnection(hint)
  );
}
