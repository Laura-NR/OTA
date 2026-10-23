import {
  ADVISORY_DUAL_APPROVAL_LEVELS,
  INVITE_STATES,
  SETTINGS_VERSION_STATUSES,
  UserRole,
  type AdvisoryDualApprovalLevel,
  type InviteState,
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
