import { UserRole } from '../reservation/status';

/**
 * M9 staff users (`docs/schema-m9-settings.md` D4, D5, D9): invitations,
 * the last-Super-Admin guard, and the staff session limit. Pure; the API
 * stores invites and users.
 */

export const STAFF_ROLES: readonly UserRole[] = [
  UserRole.SuperAdmin,
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
];

/** How long an invitation can be accepted. */
export const INVITE_VALID_DAYS = 7;

/** Days after an invite closes before the retention scan deletes it. */
export const CLOSED_INVITE_RETENTION_DAYS = 90;

/** Hours after sign-in when a staff session ends (D9); travelers are unaffected. */
export const STAFF_SESSION_HOURS = 12;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function isStaffRole(role: string | null | undefined): boolean {
  return STAFF_ROLES.includes(role as UserRole);
}

/** The address's domain is allowed; an empty list allows any. Case is ignored. */
export function emailDomainAllowed(
  email: string,
  allowedDomains: readonly string[],
): boolean {
  if (allowedDomains.length === 0) return true;
  const domain = email.trim().toLowerCase().split('@').pop() ?? '';
  return allowedDomains.some((allowed) => allowed.trim().toLowerCase() === domain);
}

export interface InviteFacts {
  role: string;
  invitedById: string | null;
  confirmedAt: Date | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

export const INVITE_STATES = [
  'AWAITING_CONFIRMATION',
  'SENT',
  'ACCEPTED',
  'REVOKED',
  'EXPIRED',
] as const;
export type InviteState = (typeof INVITE_STATES)[number];

/** Where an invite stands; a Super Admin invite is not sent until confirmed. */
export function inviteState(invite: InviteFacts, now: Date): InviteState {
  if (invite.acceptedAt) return 'ACCEPTED';
  if (invite.revokedAt) return 'REVOKED';
  if (invite.expiresAt.getTime() <= now.getTime()) return 'EXPIRED';
  if (invite.role === UserRole.SuperAdmin && !invite.confirmedAt) {
    return 'AWAITING_CONFIRMATION';
  }
  return 'SENT';
}

/** When an invite closed (accepted, revoked or expired), or null while open. */
export function inviteClosedAt(invite: InviteFacts, now: Date): Date | null {
  if (invite.acceptedAt) return invite.acceptedAt;
  if (invite.revokedAt) return invite.revokedAt;
  if (invite.expiresAt.getTime() <= now.getTime()) return invite.expiresAt;
  return null;
}

/** A closed invite holds a work email; the retention scan deletes it after 90 days. */
export function isInvitePurgeDue(invite: InviteFacts, now: Date): boolean {
  const closed = inviteClosedAt(invite, now);
  return (
    closed !== null &&
    now.getTime() - closed.getTime() >= CLOSED_INVITE_RETENTION_DAYS * DAY_MS
  );
}

export type InviteAcceptRefusal = 'NOT_OPEN' | 'NEEDS_CONFIRMATION' | 'WRONG_EMAIL';

/**
 * Why the signed-in person cannot accept this invite, or null: it must be
 * sent and open, and they must be signed in as the invited address.
 */
export function inviteAcceptRefusal(
  invite: InviteFacts & { email: string },
  actorEmail: string,
  now: Date,
): InviteAcceptRefusal | null {
  const state = inviteState(invite, now);
  if (state === 'AWAITING_CONFIRMATION') return 'NEEDS_CONFIRMATION';
  if (state !== 'SENT') return 'NOT_OPEN';
  if (invite.email.trim().toLowerCase() !== actorEmail.trim().toLowerCase()) {
    return 'WRONG_EMAIL';
  }
  return null;
}

export type InviteConfirmRefusal = 'NOT_AWAITING' | 'ROLE' | 'OWN_INVITE';

/** Why this person cannot confirm a Super Admin invite: a second Super Admin must. */
export function inviteConfirmRefusal(
  invite: InviteFacts,
  actor: { id: string; role: string },
  now: Date,
): InviteConfirmRefusal | null {
  if (inviteState(invite, now) !== 'AWAITING_CONFIRMATION') return 'NOT_AWAITING';
  if (actor.role !== UserRole.SuperAdmin) return 'ROLE';
  if (invite.invitedById === actor.id) return 'OWN_INVITE';
  return null;
}

/**
 * True when removing this user's Super Admin standing (a demotion or a
 * deactivation) would leave no active Super Admin.
 */
export function leavesNoSuperAdmin(
  activeSuperAdminIds: readonly string[],
  targetId: string,
): boolean {
  return activeSuperAdminIds.filter((id) => id !== targetId).length === 0;
}

/** A staff session older than the limit must sign in again (D9). */
export function isStaffSessionExpired(
  role: string | null | undefined,
  signedInAt: Date,
  now: Date,
  hours: number = STAFF_SESSION_HOURS,
): boolean {
  return isStaffRole(role) && now.getTime() - signedInAt.getTime() > hours * HOUR_MS;
}
