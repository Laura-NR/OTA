/**
 * The visitor's dismissed info and caution advisories (M7 D8): a per-browser
 * convenience, read by the server so a dismissed banner never flashes back.
 * Critical advisories are never dismissed; they are acknowledged.
 */
export const DISMISSED_ADVISORIES_COOKIE = 'ota_advisories_dismissed';

/** The ids in the cookie's value (comma-separated UUIDs). */
export function parseDismissed(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
}
