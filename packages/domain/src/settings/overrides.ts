import { UserRole } from '../reservation/status';

/**
 * M9 permission overrides (`docs/schema-m9-permission-overrides.md` O1–O7).
 * Pure: the permission matrix the API's routes are tagged with, which rows a
 * role may ask to override, and an override's status from its row and the
 * clock. The API stores overrides and decides requests with these rules.
 */

export type PermissionAccess = 'yes' | 'view' | 'no';

export const PERMISSION_CAPABILITIES = [
  'bookings',
  'dispatch',
  'messages',
  'suppliers',
  'credentials',
  'advisories',
  'disruptions',
  'payments',
  'catalog',
  'reports',
  'customers',
  'ofacExport',
  'thresholds',
  'staff',
] as const;
export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];

export interface CapabilityRow {
  key: PermissionCapability;
  superAdmin: PermissionAccess;
  operations: PermissionAccess;
  support: PermissionAccess;
}

/**
 * A-Settings' permission matrix (M9 D6): what the API's routes enforce, one
 * capability per row. The API tags each staff route with its row, and
 * `apps/api/test/authorization.e2e.test.ts` asserts the same allow-lists.
 */
export const PERMISSION_MATRIX: readonly CapabilityRow[] = [
  { key: 'bookings', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'dispatch', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'messages', superAdmin: 'yes', operations: 'yes', support: 'yes' },
  { key: 'suppliers', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'credentials', superAdmin: 'yes', operations: 'yes', support: 'yes' },
  { key: 'advisories', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'disruptions', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'payments', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'catalog', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'reports', superAdmin: 'yes', operations: 'yes', support: 'yes' },
  { key: 'customers', superAdmin: 'yes', operations: 'yes', support: 'view' },
  { key: 'ofacExport', superAdmin: 'yes', operations: 'no', support: 'no' },
  { key: 'thresholds', superAdmin: 'yes', operations: 'view', support: 'view' },
  { key: 'staff', superAdmin: 'yes', operations: 'no', support: 'no' },
];

/**
 * Rows no override reaches (O2): a second Super Admin or the OFAC archive
 * guards them, so an override would replace that second person.
 */
export const SUPER_ADMIN_ROWS: readonly PermissionCapability[] = [
  'ofacExport',
  'thresholds',
  'staff',
];

/** An override's length bounds and default, in hours (O5). */
export const OVERRIDE_EXPIRY_HOURS = { min: 1, max: 24, default: 24 } as const;

/** Hours a request waits for a Super Admin before it lapses (O4). */
export const OVERRIDE_REQUEST_LAPSE_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

const ROLE_COLUMN: Partial<Record<string, 'superAdmin' | 'operations' | 'support'>> = {
  [UserRole.SuperAdmin]: 'superAdmin',
  [UserRole.OperationsAdmin]: 'operations',
  [UserRole.AdministrativeSupport]: 'support',
};

export function isPermissionCapability(value: string): value is PermissionCapability {
  return (PERMISSION_CAPABILITIES as readonly string[]).includes(value);
}

/** What a role may do on a row; anyone outside the staff roles has nothing. */
export function roleAccess(
  role: string | null | undefined,
  capability: PermissionCapability,
): PermissionAccess {
  const column = role ? ROLE_COLUMN[role] : undefined;
  const row = PERMISSION_MATRIX.find((candidate) => candidate.key === capability);
  return column && row ? row[column] : 'no';
}

/**
 * Whether this role may ask to override this row (O2): the role can view it
 * but not act on it, and it is not a Super Admin row.
 */
export function isOverridable(
  role: string | null | undefined,
  capability: PermissionCapability,
): boolean {
  return roleAccess(role, capability) === 'view' && !SUPER_ADMIN_ROWS.includes(capability);
}

/** The rows this role may ask to override, in matrix order. */
export function overridableCapabilities(
  role: string | null | undefined,
): PermissionCapability[] {
  return PERMISSION_CAPABILITIES.filter((capability) => isOverridable(role, capability));
}

export const OVERRIDE_STATES = ['REQUESTED', 'APPROVED', 'DECLINED', 'ENDED'] as const;
export type OverrideState = (typeof OVERRIDE_STATES)[number];

/** The stored state plus what the clock adds: a lapsed request, an expired override. */
export type OverrideStatus =
  'REQUESTED' | 'LAPSED' | 'ACTIVE' | 'EXPIRED' | 'DECLINED' | 'ENDED';

export interface OverrideRecord {
  state: OverrideState;
  requestedAt: Date;
  expiresAt: Date | null;
}

export function overrideStatus(override: OverrideRecord, now: Date): OverrideStatus {
  switch (override.state) {
    case 'REQUESTED':
      return now.getTime() >= requestLapsesAt(override.requestedAt).getTime()
        ? 'LAPSED'
        : 'REQUESTED';
    case 'APPROVED':
      return override.expiresAt && now.getTime() < override.expiresAt.getTime()
        ? 'ACTIVE'
        : 'EXPIRED';
    default:
      return override.state;
  }
}

/** A request or a running override: a person holds one of these per row at most (O4). */
export function isOpenOverride(status: OverrideStatus): boolean {
  return status === 'REQUESTED' || status === 'ACTIVE';
}

export function requestLapsesAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + OVERRIDE_REQUEST_LAPSE_HOURS * HOUR_MS);
}

/** When an override approved now ends (O5); the clock starts at approval. */
export function overrideExpiresAt(approvedAt: Date, expiryHours: number): Date {
  return new Date(approvedAt.getTime() + expiryHours * HOUR_MS);
}

export type OverrideRequestRefusal = 'NOT_STAFF' | 'ALREADY_HELD' | 'NOT_OVERRIDABLE';

/** Why this role cannot ask for this row, or null (O2). */
export function overrideRequestRefusal(
  role: string | null | undefined,
  capability: PermissionCapability,
): OverrideRequestRefusal | null {
  const access = roleAccess(role, capability);
  if (!role || !ROLE_COLUMN[role]) return 'NOT_STAFF';
  if (access === 'yes') return 'ALREADY_HELD';
  return isOverridable(role, capability) ? null : 'NOT_OVERRIDABLE';
}

export type OverrideDecision = 'APPROVE' | 'DECLINE' | 'END';

export type OverrideDecisionRefusal = 'NOT_PENDING' | 'NOT_OPEN' | 'ROLE' | 'OWN_REQUEST';

/**
 * Why this person cannot take this decision, or null (O4, O5). A Super
 * Admin other than the holder approves or declines a pending request; a
 * Super Admin or the holder ends a pending request or a running override.
 */
export function overrideDecisionRefusal(
  override: { userId: string; status: OverrideStatus },
  actor: { id: string; role: string },
  decision: OverrideDecision,
): OverrideDecisionRefusal | null {
  if (decision === 'END') {
    if (!isOpenOverride(override.status)) return 'NOT_OPEN';
    return actor.id === override.userId || actor.role === UserRole.SuperAdmin
      ? null
      : 'ROLE';
  }
  if (override.status !== 'REQUESTED') return 'NOT_PENDING';
  if (actor.role !== UserRole.SuperAdmin) return 'ROLE';
  return actor.id === override.userId ? 'OWN_REQUEST' : null;
}
