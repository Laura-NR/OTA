import { parseIpRange } from '@ota/domain';

// Client-safe: the desk layout, the passkeys page and the login page share it.

/** The API's code for a Super Admin session from outside the IP allowlist. */
export const IP_NOT_ALLOWED_CODE = 'IP_NOT_ALLOWED';

/**
 * The refusal of a Super Admin session signed in from outside the IP
 * allowlist (`docs/schema-m9-ip-allowlist.md` I3), with its address, or null
 * for any other error body.
 */
export function ipRefusal(body: unknown): { address: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const { code, ipAddress } = body as { code?: unknown; ipAddress?: unknown };
  if (code !== IP_NOT_ALLOWED_CODE) return null;
  return { address: typeof ipAddress === 'string' ? ipAddress : null };
}

/** The login page that signs the refused session out and says why. */
export function ipRefusedLoginPath(address: string | null): string {
  const query = new URLSearchParams({ refused: 'ip' });
  if (address) query.set('address', address);
  return `/login?${query.toString()}`;
}

/**
 * From the login page's query: undefined when no IP refusal sent the person
 * here, else the address to name, or null when it is missing or is not an
 * address (the query is the visitor's to edit, so nothing else is shown).
 */
export function refusedAddress(search: string): string | null | undefined {
  const query = new URLSearchParams(search);
  if (query.get('refused') !== 'ip') return undefined;
  const address = query.get('address');
  return address && !address.includes('/') && parseIpRange(address) ? address : null;
}
