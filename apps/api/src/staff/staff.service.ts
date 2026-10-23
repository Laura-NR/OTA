import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Prisma, StaffInvite } from '@ota/db';
import {
  INVITE_VALID_DAYS,
  STAFF_ROLES,
  UserRole,
  emailDomainAllowed,
  inviteAcceptRefusal,
  inviteConfirmRefusal,
  inviteState,
  isStaffRole,
  leavesNoSuperAdmin,
} from '@ota/domain';
import { staffInviteEmail, type Mailer } from '@ota/email';
import type {
  ChangeStaffRoleRequest,
  CreateInviteRequest,
  StaffInviteDto,
  StaffUserDto,
} from '@ota/schemas';
import { createHash, randomBytes } from 'node:crypto';

import type { AuthUser } from '../common/auth/auth-user';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

const DAY_MS = 24 * 60 * 60 * 1000;
const ENTITY_USER = 'User';
const ENTITY_INVITE = 'StaffInvite';
const PERSON = { select: { fullName: true, email: true } } as const;

/** The role as the invitation email names it, in the tenant's primary language. */
const ROLE_LABELS: Record<string, Record<string, string>> = {
  en: {
    SUPER_ADMIN: 'Super Admin',
    OPERATIONS_ADMIN: 'Operations Admin',
    ADMINISTRATIVE_SUPPORT: 'Administrative Support',
  },
  es: {
    SUPER_ADMIN: 'Super Admin',
    OPERATIONS_ADMIN: 'Admin de Operaciones',
    ADMINISTRATIVE_SUPPORT: 'Soporte Administrativo',
  },
  fr: {
    SUPER_ADMIN: 'Super Admin',
    OPERATIONS_ADMIN: 'Admin des opérations',
    ADMINISTRATIVE_SUPPORT: 'Support administratif',
  },
};

type InviteRow = StaffInvite & {
  invitedBy: { fullName: string | null; email: string } | null;
  confirmedBy: { fullName: string | null; email: string } | null;
};

function personName(user: { fullName: string | null; email: string } | null) {
  return user ? (user.fullName ?? user.email) : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/** The back-office origin the invitation links to. */
export function backofficeBaseUrl(): string {
  return (process.env.BACKOFFICE_PUBLIC_URL ?? 'http://localhost:3002').replace(
    /\/$/,
    '',
  );
}

/**
 * M9 staff users (`docs/schema-m9-settings.md` D4, D5): the desk's users,
 * invitations (a Super Admin invite, also the way to promote an existing
 * staff member, is sent only once a second Super Admin confirms it), role
 * changes, session revocation and deactivation. Every change is audited.
 */
@Injectable()
export class StaffService {
  private readonly logger = new Logger(StaffService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async list(): Promise<StaffUserDto[]> {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      orderBy: [{ deactivatedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        deactivatedAt: true,
        _count: { select: { passkeys: true } },
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });
    return users.map((user) => ({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role as StaffUserDto['role'],
      passkeys: user._count.passkeys,
      lastSignInAt: user.sessions[0]?.createdAt.toISOString() ?? null,
      deactivatedAt: user.deactivatedAt ? user.deactivatedAt.toISOString() : null,
    }));
  }

  async invites(): Promise<StaffInviteDto[]> {
    const rows = await this.prisma.staffInvite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { invitedBy: PERSON, confirmedBy: PERSON },
    });
    const now = new Date();
    return rows.map((row) => this.toInvite(row, now));
  }

  /**
   * Invite an address to a staff role. The address must be in the manifest's
   * allowed domains and must not belong to a traveler or a supplier; an
   * existing staff member can only be invited to become a Super Admin.
   */
  async invite(actor: AuthUser, input: CreateInviteRequest): Promise<StaffInviteDto> {
    if (!emailDomainAllowed(input.email, this.tenant.staff.allowedEmailDomains)) {
      throw new UnprocessableEntityException(
        `Invitations go to ${this.tenant.staff.allowedEmailDomains.join(', ')} addresses only`,
      );
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { role: true, deactivatedAt: true },
    });
    if (existing && !isStaffRole(existing.role)) {
      throw new ConflictException(
        'This address belongs to a traveler or supplier account; invite a staff address',
      );
    }
    if (
      existing &&
      (input.role !== UserRole.SuperAdmin || existing.role === UserRole.SuperAdmin)
    ) {
      throw new ConflictException(
        'This person is already on the desk; change their role instead',
      );
    }
    const now = new Date();
    const open = await this.prisma.staffInvite.findMany({
      where: {
        email: input.email,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (open.length > 0) {
      throw new ConflictException('An invitation to this address is already open');
    }

    const { token, tokenHash } = newToken();
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.staffInvite.create({
        data: {
          email: input.email,
          role: input.role,
          tokenHash,
          invitedById: actor.id,
          expiresAt: new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS),
        },
        include: { invitedBy: PERSON, confirmedBy: PERSON },
      });
      await this.audit(tx, actor, 'staff.invited', ENTITY_INVITE, created.id, {
        role: input.role,
      });
      return created;
    });
    // A Super Admin invite waits for the second Super Admin; its token is
    // replaced when it is confirmed, so this one is never sent.
    if (input.role !== UserRole.SuperAdmin) {
      await this.send(row, token);
    }
    return this.toInvite(row, now);
  }

  /** A second Super Admin confirms a Super Admin invite, which sends it. */
  async confirm(actor: AuthUser, id: string): Promise<StaffInviteDto> {
    const invite = await this.load(id);
    const now = new Date();
    const refusal = inviteConfirmRefusal(invite, actor, now);
    if (refusal === 'NOT_AWAITING') {
      throw new ConflictException('This invitation is not waiting for a confirmation');
    }
    if (refusal) {
      throw new ForbiddenException(
        'A second Super Admin confirms a Super Admin invitation',
      );
    }
    const { token, tokenHash } = newToken();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffInvite.update({
        where: { id },
        data: {
          confirmedById: actor.id,
          confirmedAt: now,
          tokenHash,
          expiresAt: new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS),
        },
        include: { invitedBy: PERSON, confirmedBy: PERSON },
      });
      await this.audit(tx, actor, 'staff.invite_confirmed', ENTITY_INVITE, id, {});
      return updated;
    });
    await this.send(row, token);
    return this.toInvite(row, now);
  }

  /** Send a new link (the old one stops working) and restart the 7 days. */
  async resend(actor: AuthUser, id: string): Promise<StaffInviteDto> {
    const invite = await this.load(id);
    const now = new Date();
    const state = inviteState(invite, now);
    if (state !== 'SENT' && state !== 'EXPIRED') {
      throw new ConflictException('Only a sent or expired invitation can be sent again');
    }
    const { token, tokenHash } = newToken();
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffInvite.update({
        where: { id },
        data: {
          tokenHash,
          expiresAt: new Date(now.getTime() + INVITE_VALID_DAYS * DAY_MS),
        },
        include: { invitedBy: PERSON, confirmedBy: PERSON },
      });
      await this.audit(tx, actor, 'staff.invite_resent', ENTITY_INVITE, id, {});
      return updated;
    });
    await this.send(row, token);
    return this.toInvite(row, now);
  }

  async revoke(actor: AuthUser, id: string): Promise<StaffInviteDto> {
    const invite = await this.load(id);
    const now = new Date();
    const state = inviteState(invite, now);
    if (state !== 'SENT' && state !== 'AWAITING_CONFIRMATION') {
      throw new ConflictException('This invitation is already closed');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.staffInvite.update({
        where: { id },
        data: { revokedAt: now },
        include: { invitedBy: PERSON, confirmedBy: PERSON },
      });
      await this.audit(tx, actor, 'staff.invite_revoked', ENTITY_INVITE, id, {});
      return updated;
    });
    return this.toInvite(row, now);
  }

  /**
   * The signed-in person accepts an invitation addressed to them. A fresh
   * account (no booking, no supplier profile) or a staff member being
   * promoted takes the invited role; anyone else is refused.
   */
  async accept(actor: AuthUser, token: string): Promise<{ role: string }> {
    const invite = await this.prisma.staffInvite.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!invite) {
      throw new NotFoundException('This invitation link is not valid');
    }
    const now = new Date();
    const refusal = inviteAcceptRefusal(invite, actor.email, now);
    if (refusal === 'WRONG_EMAIL') {
      throw new ForbiddenException('Sign in with the invited address to accept');
    }
    if (refusal) {
      throw new ConflictException('This invitation is no longer open');
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        role: true,
        _count: { select: { reservations: true } },
        supplierProfile: { select: { id: true } },
      },
    });
    const fresh =
      user.role === UserRole.Traveler &&
      user._count.reservations === 0 &&
      user.supplierProfile === null;
    if (!fresh && !isStaffRole(user.role)) {
      throw new ConflictException(
        'This account has bookings or a supplier profile; staff use a separate address',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const accepted = await tx.staffInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: now, acceptedById: actor.id },
      });
      if (accepted.count === 0) {
        throw new ConflictException('This invitation is no longer open');
      }
      await tx.user.update({
        where: { id: actor.id },
        data: { role: invite.role, deactivatedAt: null },
      });
      await this.audit(tx, actor, 'staff.invite_accepted', ENTITY_INVITE, invite.id, {
        from: user.role,
        to: invite.role,
      });
    });
    return { role: invite.role };
  }

  /** Move a staff member between Operations Admin and Administrative Support. */
  async changeRole(
    actor: AuthUser,
    id: string,
    input: ChangeStaffRoleRequest,
  ): Promise<StaffUserDto> {
    const target = await this.loadStaff(actor, id);
    if (target.role === UserRole.SuperAdmin) {
      await this.assertNotLastSuperAdmin(id);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { role: input.role } });
      await this.audit(tx, actor, 'staff.role_changed', ENTITY_USER, id, {
        from: target.role,
        to: input.role,
      });
    });
    return this.one(id);
  }

  /** Sign a user out everywhere: their sessions are deleted. */
  async revokeSessions(actor: AuthUser, id: string): Promise<StaffUserDto> {
    await this.loadStaff(actor, id, { allowSelf: true });
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.session.deleteMany({ where: { userId: id } });
      await this.audit(tx, actor, 'staff.sessions_revoked', ENTITY_USER, id, {
        sessions: removed.count,
      });
    });
    return this.one(id);
  }

  /** The guard refuses a deactivated user; their sessions end at once. */
  async deactivate(actor: AuthUser, id: string): Promise<StaffUserDto> {
    const target = await this.loadStaff(actor, id);
    if (target.deactivatedAt) {
      throw new ConflictException('This user is already deactivated');
    }
    if (target.role === UserRole.SuperAdmin) {
      await this.assertNotLastSuperAdmin(id);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { deactivatedAt: new Date() } });
      await tx.session.deleteMany({ where: { userId: id } });
      await this.audit(tx, actor, 'staff.deactivated', ENTITY_USER, id, {});
    });
    return this.one(id);
  }

  async reactivate(actor: AuthUser, id: string): Promise<StaffUserDto> {
    const target = await this.loadStaff(actor, id);
    if (!target.deactivatedAt) {
      throw new ConflictException('This user is active');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { deactivatedAt: null } });
      await this.audit(tx, actor, 'staff.reactivated', ENTITY_USER, id, {});
    });
    return this.one(id);
  }

  private async one(id: string): Promise<StaffUserDto> {
    const user = (await this.list()).find((row) => row.id === id);
    if (!user) throw new NotFoundException(`Staff user ${id} not found`);
    return user;
  }

  private async load(id: string): Promise<StaffInvite> {
    const invite = await this.prisma.staffInvite.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException(`Invitation ${id} not found`);
    return invite;
  }

  /** A staff user other than the actor (unless allowed), or 404/422. */
  private async loadStaff(
    actor: AuthUser,
    id: string,
    options: { allowSelf?: boolean } = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, deactivatedAt: true },
    });
    if (!user || !isStaffRole(user.role)) {
      throw new NotFoundException(`Staff user ${id} not found`);
    }
    if (!options.allowSelf && user.id === actor.id) {
      throw new UnprocessableEntityException(
        'Another Super Admin makes this change for you',
      );
    }
    return user;
  }

  private async assertNotLastSuperAdmin(id: string): Promise<void> {
    const supers = await this.prisma.user.findMany({
      where: { role: UserRole.SuperAdmin, deactivatedAt: null },
      select: { id: true },
    });
    if (
      leavesNoSuperAdmin(
        supers.map((user) => user.id),
        id,
      )
    ) {
      throw new ConflictException('The desk needs at least one active Super Admin');
    }
  }

  private async send(invite: InviteRow, token: string): Promise<void> {
    const locale = this.tenant.primaryLocale;
    const labels = ROLE_LABELS[locale] ?? ROLE_LABELS.en!;
    try {
      await this.mailer.send(
        staffInviteEmail({
          to: invite.email,
          roleLabel: labels[invite.role] ?? invite.role,
          inviterName: personName(invite.invitedBy),
          url: `${backofficeBaseUrl()}/invite?token=${encodeURIComponent(token)}`,
          expiresOn: new Intl.DateTimeFormat(locale, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(invite.expiresAt),
          locale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      // The invite stands; the desk can send it again from the list.
      this.logger.warn(
        `Invitation ${invite.id} could not be emailed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toInvite(row: InviteRow, now: Date): StaffInviteDto {
    return {
      id: row.id,
      email: row.email,
      role: row.role as StaffInviteDto['role'],
      state: inviteState(row, now),
      invitedById: row.invitedById,
      invitedByName: personName(row.invitedBy),
      confirmedByName: personName(row.confirmedBy),
      expiresAt: row.expiresAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: { actorUserId: actor.id, action, entityType, entityId, metadata },
    });
  }
}
