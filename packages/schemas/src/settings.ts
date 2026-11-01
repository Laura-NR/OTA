import {
  ADVISORY_DUAL_APPROVAL_LEVELS,
  INVITE_STATES,
  OVERRIDE_EXPIRY_HOURS,
  PERMISSION_CAPABILITIES,
  SETTINGS_VERSION_STATUSES,
  UserRole,
  type AdvisoryDualApprovalLevel,
  type InviteState,
  type OverrideStatus,
  type PermissionCapability,
  type SettingsVersionStatus,
} from '@ota/domain';
import { z } from 'zod';

/** M9 settings (`docs/schema-m9-settings.md`). */

const whole = (min: number, max: number) => z.number().int().min(min).max(max);

/**
 * The operating thresholds document. Each value's bounds are here; the
 * checks across values (refund limits, the short-notice timer) are the
 * domain's `thresholdsIssues`.
 */
export const operatingThresholdsSchema = z.object({
  dispatchTimeoutMinutes: whole(15, 720),
  shortNoticeTimeoutMinutes: whole(5, 240),
  shortNoticeWindowHours: whole(1, 168),
  amberPercent: whole(50, 95),
  paymentWindowHours: whole(1, 336),
  refundSingleUpTo: z.number().min(0).max(100_000),
  refundDualUpTo: z.number().min(0).max(100_000),
  credentialExpiryWindowDays: whole(0, 120),
  advisoryDualApprovalFrom: z.enum([...ADVISORY_DUAL_APPROVAL_LEVELS] as [
    AdvisoryDualApprovalLevel,
    ...AdvisoryDualApprovalLevel[],
  ]),
  retentionTriggerMonths: whole(1, 24),
  retentionGraceDays: whole(14, 90),
  resourcesStaleDays: whole(1, 60),
  reliabilityFloorPercent: whole(0, 100),
  reliabilityMinAnswered: whole(1, 100),
  conciergeAnswerHours: whole(1, 168),
  staffPasskeysRequired: z.boolean(),
  staffIdleLockMinutes: whole(5, 240),
  staffNewDeviceEmail: z.boolean(),
  overrideExpiryHours: whole(OVERRIDE_EXPIRY_HOURS.min, OVERRIDE_EXPIRY_HOURS.max),
  // Runtime feature flags (M9 D8b); the manifest's values are the defaults.
  interactiveSvgMap: z.boolean(),
  culturalEventsBanner: z.boolean(),
  recruitmentPortal: z.boolean(),
  customItineraryBuilder: z.boolean(),
  instantBooking: z.boolean(),
  directBankTransferRail: z.boolean(),
  creditCardGatewayRail: z.boolean(),
});

export type OperatingThresholdsDto = z.infer<typeof operatingThresholdsSchema>;

export const proposeSettingsSchema = z.object({
  values: operatingThresholdsSchema,
  reason: z.string().trim().min(3).max(500),
});

export type ProposeSettingsRequest = z.infer<typeof proposeSettingsSchema>;

export const settingsVersionStatusSchema = z.enum([...SETTINGS_VERSION_STATUSES] as [
  SettingsVersionStatus,
  ...SettingsVersionStatus[],
]);

export const settingsVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  values: operatingThresholdsSchema,
  reason: z.string(),
  status: settingsVersionStatusSchema,
  proposedById: z.string().uuid().nullable(),
  proposedByName: z.string().nullable(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  /** The keys this version changes against the one applied when it was read. */
  changes: z.array(z.string()),
});

export type SettingsVersionDto = z.infer<typeof settingsVersionSchema>;

/** What the desk runs on now: the applied version, or the defaults (version 0). */
export const operatingSettingsSchema = z.object({
  version: z.number().int(),
  values: operatingThresholdsSchema,
  /** The code's defaults merged with the manifest: "Reset to spec defaults". */
  defaults: operatingThresholdsSchema,
  appliedAt: z.string().nullable(),
  appliedByName: z.string().nullable(),
  pending: settingsVersionSchema.nullable(),
});

export type OperatingSettingsDto = z.infer<typeof operatingSettingsSchema>;

const staffRoleSchema = z.enum([
  UserRole.SuperAdmin,
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
]);

export const staffUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string().nullable(),
  role: staffRoleSchema,
  passkeys: z.number().int(),
  /** The newest session still on file; sessions end at sign-out. */
  lastSignInAt: z.string().nullable(),
  deactivatedAt: z.string().nullable(),
  /** When the recovery code a Super Admin issued stops working, while one is open. */
  recoveryCodeOpenUntil: z.string().nullable(),
});

export type StaffUserDto = z.infer<typeof staffUserSchema>;

export const inviteStateSchema = z.enum([...INVITE_STATES] as [
  InviteState,
  ...InviteState[],
]);

export const staffInviteSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: staffRoleSchema,
  state: inviteStateSchema,
  invitedById: z.string().uuid().nullable(),
  invitedByName: z.string().nullable(),
  confirmedByName: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type StaffInviteDto = z.infer<typeof staffInviteSchema>;

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: staffRoleSchema,
});

export type CreateInviteRequest = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20).max(200),
});

export type AcceptInviteRequest = z.infer<typeof acceptInviteSchema>;

/** A role change; promotion to Super Admin goes through a confirmed invite (D5). */
export const changeStaffRoleSchema = z.object({
  role: z.enum([UserRole.OperationsAdmin, UserRole.AdministrativeSupport]),
});

export type ChangeStaffRoleRequest = z.infer<typeof changeStaffRoleSchema>;

export const auditLogQuerySchema = z.object({
  entityType: z.string().trim().min(1).max(60).optional(),
  action: z.string().trim().min(1).max(80).optional(),
  /** Entries older than this time (the next page). */
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** One line of the Super Admin's audit log (Security & audit tab). */
export const systemAuditEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});

export type SystemAuditEntryDto = z.infer<typeof systemAuditEntrySchema>;

/** Q12: whether an integration is configured, never its value. */
export const integrationStatusSchema = z.object({
  key: z.string(),
  configured: z.boolean(),
});

export type IntegrationStatusDto = z.infer<typeof integrationStatusSchema>;

/** The Security tab: the sign-in limits in force (config, D9) and the integrations. */
export const securityStatusSchema = z.object({
  staffSessionHours: z.number(),
  signInLinkMinutes: z.number(),
  integrations: z.array(integrationStatusSchema),
});

export type SecurityStatusDto = z.infer<typeof securityStatusSchema>;

/** One of the signed-in person's passkeys (`docs/schema-m9-passkeys.md` P4). */
export const passkeySchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  createdAt: z.string().nullable(),
  /** `singleDevice` or `multiDevice` (synced), as WebAuthn reports it. */
  deviceType: z.string(),
  backedUp: z.boolean(),
});

export type PasskeyDto = z.infer<typeof passkeySchema>;

/**
 * The signed-in person's passkeys and where the staff rule leaves this
 * session: `ok`, `enroll` (set one up first) or `use_passkey` (P1–P3).
 */
export const passkeyStatusSchema = z.object({
  /** The rule is in force (the applied switch, unless the deploy's break-glass). */
  required: z.boolean(),
  /** This session came from a passkey sign-in. */
  passkeySession: z.boolean(),
  /** This session came from a recovery code: it may only set up a passkey. */
  recoverySession: z.boolean(),
  state: z.enum(['ok', 'enroll', 'use_passkey']),
  passkeys: z.array(passkeySchema),
});

export type PasskeyStatusDto = z.infer<typeof passkeyStatusSchema>;

/**
 * The signed-in staff session as the desk's idle lock reads it
 * (`docs/schema-m9-idle-lock.md`). `idleLockMinutes` is null for an
 * own-device session, which never locks.
 */
export const deskSessionSchema = z.object({
  userId: z.string().uuid(),
  ownDevice: z.boolean(),
  idleLockMinutes: z.number().int().nullable(),
  signedInAt: z.string(),
  lastActiveAt: z.string().nullable(),
});

export type DeskSessionDto = z.infer<typeof deskSessionSchema>;

/** A Super Admin resets another staff member's passkeys, with a reason (P5). */
export const resetPasskeysSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type ResetPasskeysRequest = z.infer<typeof resetPasskeysSchema>;

/**
 * A Super Admin issues a one-time recovery code for another staff member, with
 * a reason (`docs/schema-m9-recovery-codes.md` R1).
 */
export const issueRecoveryCodeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export type IssueRecoveryCodeRequest = z.infer<typeof issueRecoveryCodeSchema>;

/** The code, shown once to the issuer and never stored, and what issuing did. */
export const recoveryCodeIssuedSchema = z.object({
  code: z.string(),
  expiresAt: z.string(),
  /** The person's passkeys the issue removed (R3). */
  passkeysRemoved: z.number().int(),
  user: staffUserSchema,
});

export type RecoveryCodeIssuedDto = z.infer<typeof recoveryCodeIssuedSchema>;

export const permissionCapabilitySchema = z.enum([...PERMISSION_CAPABILITIES] as [
  PermissionCapability,
  ...PermissionCapability[],
]);

/**
 * A staff member asks to override one permission-matrix row, with a reason
 * (`docs/schema-m9-permission-overrides.md` O1, O4).
 */
export const requestOverrideSchema = z.object({
  capability: permissionCapabilitySchema,
  reason: z.string().trim().min(3).max(500),
});

export type RequestOverrideRequest = z.infer<typeof requestOverrideSchema>;

/** Approving, declining or ending an override, with an optional note. */
export const overrideNoteSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

export type OverrideNoteRequest = z.infer<typeof overrideNoteSchema>;

export const overrideStatusSchema = z.enum([
  'REQUESTED',
  'LAPSED',
  'ACTIVE',
  'EXPIRED',
  'DECLINED',
  'ENDED',
] as [OverrideStatus, ...OverrideStatus[]]);

export const permissionOverrideSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  userName: z.string().nullable(),
  userEmail: z.string(),
  userRole: staffRoleSchema,
  capability: permissionCapabilitySchema,
  reason: z.string(),
  /** The stored state read against the clock (O4, O5). */
  status: overrideStatusSchema,
  requestedAt: z.string(),
  decidedByName: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  expiresAt: z.string().nullable(),
  endedByName: z.string().nullable(),
  endedAt: z.string().nullable(),
  endNote: z.string().nullable(),
});

export type PermissionOverrideDto = z.infer<typeof permissionOverrideSchema>;

/** Settings › Permissions for Super Admins: pending requests, running overrides, the last 30 days. */
export const permissionOverridesSchema = z.object({
  requests: z.array(permissionOverrideSchema),
  active: z.array(permissionOverrideSchema),
  recent: z.array(permissionOverrideSchema),
});

export type PermissionOverridesDto = z.infer<typeof permissionOverridesSchema>;

/**
 * The signed-in staff member's overrides as a view-only page reads them: the
 * rows they may ask for, and their overrides of the last two days plus any
 * still open.
 */
export const myOverridesSchema = z.object({
  overridable: z.array(permissionCapabilitySchema),
  expiryHours: z.number().int(),
  overrides: z.array(permissionOverrideSchema),
});

export type MyOverridesDto = z.infer<typeof myOverridesSchema>;
