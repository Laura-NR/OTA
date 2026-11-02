import { UserRole } from '../reservation/status';

/**
 * The Super Admin IP allowlist (`docs/schema-m9-ip-allowlist.md` I1–I7). Pure:
 * the API reads the switch, the list and the address a session signed in
 * from (Express's `req.ip` under `TRUST_PROXY`, I2), and asks these rules.
 */

/** One allowlisted address or range, with a label such as "Havana office". */
export interface IpAllowlistEntry {
  label: string;
  /** An IPv4 or IPv6 address, or a range in CIDR form (`203.0.113.0/24`). */
  cidr: string;
}

export const IP_ALLOWLIST_MAX_ENTRIES = 20;
export const IP_ALLOWLIST_LABEL_MAX = 60;

/**
 * Better Auth stores an IPv6 sign-in address cut to its /64 network, so an
 * IPv6 entry narrower than that could never match (I2).
 */
export const IPV6_ALLOWLIST_MAX_PREFIX = 64;

interface IpRange {
  bytes: Uint8Array;
  prefix: number;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROUP = /^[0-9a-f]{1,4}$/i;

function ipv4Bytes(value: string): number[] | null {
  const match = IPV4.exec(value);
  if (!match) return null;
  const octets = match.slice(1);
  // A leading zero reads as octal to some tools; refuse it rather than guess.
  if (octets.some((octet) => octet.length > 1 && octet.startsWith('0'))) return null;
  const bytes = octets.map(Number);
  return bytes.every((byte) => byte <= 255) ? bytes : null;
}

function hexGroups(part: string, endsAddress: boolean): number[] | null {
  if (part === '') return [];
  const groups: number[] = [];
  const pieces = part.split(':');
  for (const [index, piece] of pieces.entries()) {
    // An embedded IPv4 address may only end the address (`::ffff:192.0.2.1`).
    if (endsAddress && index === pieces.length - 1 && piece.includes('.')) {
      const v4 = ipv4Bytes(piece);
      if (!v4) return null;
      groups.push((v4[0]! << 8) | v4[1]!, (v4[2]! << 8) | v4[3]!);
    } else if (HEX_GROUP.test(piece)) {
      groups.push(Number.parseInt(piece, 16));
    } else {
      return null;
    }
  }
  return groups;
}

function ipv6Bytes(value: string): Uint8Array | null {
  const halves = value.split('::');
  if (halves.length > 2) return null;
  const head = hexGroups(halves[0]!, halves.length === 1);
  const tail = halves.length === 2 ? hexGroups(halves[1]!, true) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<number>(missing).fill(0), ...tail];
  const bytes = new Uint8Array(16);
  groups.forEach((group, index) => {
    bytes[index * 2] = group >> 8;
    bytes[index * 2 + 1] = group & 0xff;
  });
  return bytes;
}

/** Whether 16 bytes are an IPv4 address written as IPv6 (`::ffff:a.b.c.d`). */
function isIpv4Mapped(bytes: Uint8Array): boolean {
  return (
    bytes.length === 16 &&
    bytes.subarray(0, 10).every((byte) => byte === 0) &&
    bytes[10] === 0xff &&
    bytes[11] === 0xff
  );
}

/**
 * An address's bytes: 4 for IPv4 (an IPv4-mapped IPv6 address included, as
 * Express reports IPv4 clients on a dual-stack socket), 16 for IPv6, or null.
 */
function ipBytes(value: string): Uint8Array | null {
  const v4 = ipv4Bytes(value);
  if (v4) return Uint8Array.from(v4);
  if (!value.includes(':')) return null;
  const v6 = ipv6Bytes(value);
  if (!v6) return null;
  return isIpv4Mapped(v6) ? v6.slice(12) : v6;
}

/**
 * An address or CIDR range, or null when it is neither. A range written with
 * host bits (`203.0.113.9/24`) means its network. An IPv4-mapped IPv6 range
 * becomes the IPv4 range it covers.
 */
export function parseIpRange(value: string): IpRange | null {
  const text = value.trim();
  const slash = text.indexOf('/');
  const address = slash === -1 ? text : text.slice(0, slash);
  const v6 = address.includes(':') ? ipv6Bytes(address) : null;
  const bytes = ipBytes(address);
  if (!bytes) return null;
  const bits = (v6 ?? bytes).length * 8;
  let prefix = bits;
  if (slash !== -1) {
    const written = text.slice(slash + 1);
    if (!/^\d{1,3}$/.test(written)) return null;
    prefix = Number(written);
    if (prefix > bits) return null;
  }
  if (v6 && bytes.length === 4) {
    if (prefix < 96) return null;
    prefix -= 96;
  }
  return { bytes, prefix };
}

function inRange(address: Uint8Array, range: IpRange): boolean {
  if (address.length !== range.bytes.length) return false;
  let left = range.prefix;
  for (let index = 0; left > 0; index += 1, left -= 8) {
    const mask = left >= 8 ? 0xff : (0xff << (8 - left)) & 0xff;
    if ((address[index]! & mask) !== (range.bytes[index]! & mask)) return false;
  }
  return true;
}

export type IpRangeIssue = 'INVALID' | 'IPV6_TOO_NARROW';

/** Why an entry's address or range cannot be saved, or null (I2). */
export function ipRangeIssue(cidr: string): IpRangeIssue | null {
  const range = parseIpRange(cidr);
  if (!range) return 'INVALID';
  if (range.bytes.length === 16 && range.prefix > IPV6_ALLOWLIST_MAX_PREFIX) {
    return 'IPV6_TOO_NARROW';
  }
  return null;
}

/** Whether an address falls inside any of the ranges; an unreadable one never does. */
export function ipInRanges(
  address: string | null | undefined,
  cidrs: readonly string[],
): boolean {
  const bytes = address ? ipBytes(address.trim()) : null;
  if (!bytes) return false;
  return cidrs.some((cidr) => {
    const range = parseIpRange(cidr);
    return range !== null && inRange(bytes, range);
  });
}

/**
 * Whether the rule is in force: the applied switch, unless the deploy set
 * the break-glass `SUPER_ADMIN_IP_ALLOWLIST_OVERRIDE=off` (I4).
 */
export function superAdminIpAllowlistEnforced(
  switchedOn: boolean,
  override: string | null | undefined,
): boolean {
  return switchedOn && override?.trim().toLowerCase() !== 'off';
}

/**
 * Whether a session is refused under the rule (I1, I6): a Super Admin's,
 * while the rule is in force, whose sign-in address is outside the list or
 * unknown. Every other role passes. The apply check (I4) asks the same of the
 * applying Super Admin against the proposed list.
 */
export function superAdminIpRefused(input: {
  role: string | null | undefined;
  enforced: boolean;
  entries: readonly IpAllowlistEntry[];
  address: string | null | undefined;
}): boolean {
  if (input.role !== UserRole.SuperAdmin || !input.enforced) return false;
  return !ipInRanges(
    input.address,
    input.entries.map((entry) => entry.cidr),
  );
}
