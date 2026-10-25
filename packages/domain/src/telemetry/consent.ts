/**
 * The cookie choice (DS 04 consent, Legal › Cookie settings): essential
 * cookies always run; analytics and marketing stay off until the visitor
 * turns them on. The choice is the device's, kept in one first-party cookie
 * with the version of the words shown for each purpose, so new words ask
 * again. A signed-in traveler's choice is also written to the consent log
 * (M3), which is the evidence; the cookie is what the page obeys.
 */
export const CONSENT_COOKIE = 'ota_consent';

/** The optional purposes the banner can offer. */
export type CookiePurpose = 'analytics' | 'marketing';

/** The version of the words in force per purpose; null when the agency offers none. */
export interface CookieTextVersions {
  analytics: string | null;
  marketing: string | null;
}

export interface CookieChoice {
  analytics: boolean;
  marketing: boolean;
  /** The words shown when each purpose was chosen. */
  analyticsVersion: string | null;
  marketingVersion: string | null;
  savedAt: Date;
}

/** What the page may do now: a grant counts only for the words in force. */
export interface CookiePermissions {
  analytics: boolean;
  marketing: boolean;
}

/** T-Events `consent`: the widest purpose the visitor allows. */
export type ConsentLevel = 'essential' | 'analytics' | 'marketing';

/** The cookie value for a choice (URL-encoded query string). */
export function serializeCookieChoice(choice: CookieChoice): string {
  const params = new URLSearchParams({
    a: choice.analytics ? '1' : '0',
    av: choice.analyticsVersion ?? '',
    m: choice.marketing ? '1' : '0',
    mv: choice.marketingVersion ?? '',
    t: String(choice.savedAt.getTime()),
  });
  return encodeURIComponent(params.toString());
}

/**
 * A choice read back from the cookie, or null when there is none or it is
 * malformed. Accepts the value whether or not the reader already decoded it.
 */
export function parseCookieChoice(value: string | null | undefined): CookieChoice | null {
  if (!value) {
    return null;
  }
  let raw = value;
  if (raw.includes('%')) {
    try {
      raw = decodeURIComponent(raw);
    } catch {
      return null;
    }
  }
  const params = new URLSearchParams(raw);
  const flag = (key: string) => {
    const flagValue = params.get(key);
    return flagValue === '1' ? true : flagValue === '0' ? false : null;
  };
  const analytics = flag('a');
  const marketing = flag('m');
  const stamp = params.get('t');
  const savedAt = stamp && /^\d+$/.test(stamp) ? Number(stamp) : NaN;
  if (analytics === null || marketing === null || !Number.isSafeInteger(savedAt)) {
    return null;
  }
  return {
    analytics,
    marketing,
    analyticsVersion: params.get('av') || null,
    marketingVersion: params.get('mv') || null,
    savedAt: new Date(savedAt),
  };
}

const PURPOSES: readonly CookiePurpose[] = ['analytics', 'marketing'];

function versionOf(choice: CookieChoice, purpose: CookiePurpose): string | null {
  return purpose === 'analytics' ? choice.analyticsVersion : choice.marketingVersion;
}

/**
 * Whether to show the banner: the agency offers an optional purpose and the
 * visitor has not chosen for the words in force (no choice, or new words).
 */
export function needsCookieChoice(
  choice: CookieChoice | null,
  versions: CookieTextVersions,
): boolean {
  const offered = PURPOSES.filter((purpose) => versions[purpose] !== null);
  if (offered.length === 0) {
    return false;
  }
  return (
    !choice || offered.some((purpose) => versionOf(choice, purpose) !== versions[purpose])
  );
}

/** A purpose is allowed only when granted for the words in force. */
export function cookiePermissions(
  choice: CookieChoice | null,
  versions: CookieTextVersions,
): CookiePermissions {
  const allowed = (purpose: CookiePurpose) =>
    choice !== null &&
    choice[purpose] &&
    versions[purpose] !== null &&
    versionOf(choice, purpose) === versions[purpose];
  return { analytics: allowed('analytics'), marketing: allowed('marketing') };
}

/** Marketing without analytics still sends no analytics events. */
export function consentLevel(permissions: CookiePermissions): ConsentLevel {
  if (!permissions.analytics) {
    return 'essential';
  }
  return permissions.marketing ? 'marketing' : 'analytics';
}
