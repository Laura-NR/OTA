import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Prisma } from '@ota/db';
import {
  UserRole,
  isOpenOverride,
  isOverridable,
  overridableCapabilities,
  overrideDecisionRefusal,
  overrideExpiresAt,
  overrideRequestRefusal,
  overrideStatus,
  type OverrideDecision,
  type OverrideDecisionRefusal,
  type PermissionCapability,
} from '@ota/domain';
import { permissionOverrideRequestEmail, type Mailer } from '@ota/email';
import type {
  MyOverridesDto,
  OverrideNoteRequest,
  PermissionOverrideDto,
  PermissionOverridesDto,
  RequestOverrideRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { backofficeBaseUrl } from '../common/backoffice-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

const ENTITY = 'PermissionOverride';
const DAY_MS = 24 * 60 * 60 * 1000;
/** Settings › Permissions lists closed overrides this far back. */
const RECENT_DAYS = 30;
/** A view-only page shows the person's closed overrides this far back. */
const MINE_DAYS = 2;

const PERSON = { select: { fullName: true, email: true } } as const;
const INCLUDE = {
  user: { select: { fullName: true, email: true, role: true } },
  decidedBy: PERSON,
  endedBy: PERSON,
} as const;

type OverrideRow = Prisma.PermissionOverrideGetPayload<{ include: typeof INCLUDE }>;

function personName(user: { fullName: string | null; email: string } | null) {
  return user ? (user.fullName ?? user.email) : null;
}

const REFUSAL_MESSAGES: Record<OverrideDecisionRefusal, string> = {
  NOT_PENDING: 'This request has already been decided or has lapsed',
  NOT_OPEN: 'This override has already ended',
  ROLE: 'Only a Super Admin or the holder may do this',
  OWN_REQUEST: 'A Super Admin cannot decide their own request',
};

/**
 * Permission overrides (`docs/schema-m9-permission-overrides.md`): a staff
 * member asks for one matrix row with a reason, any one Super Admin approves
 * or declines, and an approved override lets the guard pass that row's routes
 * until it expires or is ended. Every step is audited.
 */
@Injectable()
export class PermissionOverridesService {
  private readonly logger = new Logger(PermissionOverridesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  /** The guard's lookup (O7): the person's running override for this row, if any. */
  async activeFor(
    userId: string,
    capability: PermissionCapability,
    now: Date = new Date(),
  ): Promise<{ id: string } | null> {
    return this.prisma.permissionOverride.findFirst({
      where: { userId, capability, state: 'APPROVED', expiresAt: { gt: now } },
      select: { id: true },
    });
  }

  async request(
    actor: AuthUser,
    input: RequestOverrideRequest,
    now: Date = new Date(),
  ): Promise<PermissionOverrideDto> {
    const refusal = overrideRequestRefusal(actor.role, input.capability);
    if (refusal === 'ALREADY_HELD') {
      throw new ConflictException('Your role can already do this');
    }
    if (refusal) {
      throw new ForbiddenException('This permission cannot be overridden');
    }
    const existing = await this.prisma.permissionOverride.findMany({
      where: {
        userId: actor.id,
        capability: input.capability,
        state: { in: ['REQUESTED', 'APPROVED'] },
      },
    });
    if (existing.some((row) => isOpenOverride(overrideStatus(row, now)))) {
      throw new ConflictException(
        'You already have an open request or override for this',
      );
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.permissionOverride.create({
        data: {
          userId: actor.id,
          capability: input.capability,
          reason: input.reason,
          requestedAt: now,
        },
        include: INCLUDE,
      });
      await this.audit(tx, actor, 'permission.override_requested', created.id, {
        capability: input.capability,
        reason: input.reason,
      });
      return created;
    });
    await this.tellSuperAdmins(row);
    return this.toDto(row, now);
  }

  async mine(actor: AuthUser, now: Date = new Date()): Promise<MyOverridesDto> {
    const [{ overrideExpiryHours }, rows] = await Promise.all([
      this.settings.thresholds(),
      this.prisma.permissionOverride.findMany({
        where: {
          userId: actor.id,
          OR: [
            { requestedAt: { gte: new Date(now.getTime() - MINE_DAYS * DAY_MS) } },
            { state: 'APPROVED', expiresAt: { gt: now } },
          ],
        },
        orderBy: { requestedAt: 'desc' },
        include: INCLUDE,
      }),
    ]);
    return {
      overridable: overridableCapabilities(actor.role),
      expiryHours: overrideExpiryHours,
      overrides: rows.map((row) => this.toDto(row, now)),
    };
  }

  /** Settings › Permissions: pending requests, running overrides, and the last 30 days. */
  async list(now: Date = new Date()): Promise<PermissionOverridesDto> {
    const rows = await this.prisma.permissionOverride.findMany({
      where: {
        OR: [
          { requestedAt: { gte: new Date(now.getTime() - RECENT_DAYS * DAY_MS) } },
          { state: 'APPROVED', expiresAt: { gt: now } },
        ],
      },
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: INCLUDE,
    });
    const all = rows.map((row) => this.toDto(row, now));
    return {
      requests: all.filter((item) => item.status === 'REQUESTED'),
      active: all.filter((item) => item.status === 'ACTIVE'),
      recent: all.filter((item) => !isOpenOverride(item.status)),
    };
  }

  async approve(
    actor: AuthUser,
    id: string,
    input: OverrideNoteRequest,
    now: Date = new Date(),
  ): Promise<PermissionOverrideDto> {
    const row = await this.decidable(actor, id, 'APPROVE', now);
    if (
      row.user.role &&
      !isOverridable(row.user.role, row.capability as PermissionCapability)
    ) {
      throw new ConflictException("This person's role no longer allows this override");
    }
    const { overrideExpiryHours } = await this.settings.thresholds();
    const expiresAt = overrideExpiresAt(now, overrideExpiryHours);
    return this.decide(actor, row, now, {
      where: { state: 'REQUESTED' },
      data: {
        state: 'APPROVED',
        decidedById: actor.id,
        decidedAt: now,
        decisionNote: input.note || null,
        expiresAt,
      },
      action: 'permission.override_approved',
      metadata: { expiresAt: expiresAt.toISOString(), note: input.note ?? null },
    });
  }

  async decline(
    actor: AuthUser,
    id: string,
    input: OverrideNoteRequest,
    now: Date = new Date(),
  ): Promise<PermissionOverrideDto> {
    const row = await this.decidable(actor, id, 'DECLINE', now);
    return this.decide(actor, row, now, {
      where: { state: 'REQUESTED' },
      data: {
        state: 'DECLINED',
        decidedById: actor.id,
        decidedAt: now,
        decisionNote: input.note || null,
      },
      action: 'permission.override_declined',
      metadata: { note: input.note ?? null },
    });
  }

  /** A Super Admin ends it, or the holder gives it back (or withdraws the request). */
  async end(
    actor: AuthUser,
    id: string,
    input: OverrideNoteRequest,
    now: Date = new Date(),
  ): Promise<PermissionOverrideDto> {
    const row = await this.decidable(actor, id, 'END', now);
    return this.decide(actor, row, now, {
      where: { state: { in: ['REQUESTED', 'APPROVED'] } },
      data: {
        state: 'ENDED',
        endedById: actor.id,
        endedAt: now,
        endNote: input.note || null,
      },
      action: 'permission.override_ended',
      metadata: {
        by: actor.id === row.userId ? 'holder' : 'super_admin',
        note: input.note ?? null,
      },
    });
  }

  private async decidable(
    actor: AuthUser,
    id: string,
    decision: OverrideDecision,
    now: Date,
  ): Promise<OverrideRow> {
    const row = await this.prisma.permissionOverride.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Override not found');
    const refusal = overrideDecisionRefusal(
      { userId: row.userId, status: overrideStatus(row, now) },
      actor,
      decision,
    );
    if (refusal === 'ROLE' || refusal === 'OWN_REQUEST') {
      throw new ForbiddenException(REFUSAL_MESSAGES[refusal]);
    }
    if (refusal) throw new ConflictException(REFUSAL_MESSAGES[refusal]);
    return row;
  }

  private async decide(
    actor: AuthUser,
    row: OverrideRow,
    now: Date,
    step: {
      where: Prisma.PermissionOverrideWhereInput;
      data: Prisma.PermissionOverrideUncheckedUpdateManyInput;
      action: string;
      metadata: Prisma.InputJsonObject;
    },
  ): Promise<PermissionOverrideDto> {
    const updated = await this.prisma.$transaction(async (tx) => {
      // Only one of two Super Admins deciding at once wins.
      const changed = await tx.permissionOverride.updateMany({
        where: { id: row.id, ...step.where },
        data: step.data,
      });
      if (changed.count !== 1) {
        throw new ConflictException(REFUSAL_MESSAGES.NOT_PENDING);
      }
      await this.audit(tx, actor, step.action, row.id, {
        capability: row.capability,
        holderId: row.userId,
        ...step.metadata,
      });
      return tx.permissionOverride.findUniqueOrThrow({
        where: { id: row.id },
        include: INCLUDE,
      });
    });
    return this.toDto(updated, now);
  }

  /** O8: every active Super Admin is told; a failed send is logged, the request stands. */
  private async tellSuperAdmins(row: OverrideRow): Promise<void> {
    const [admins, { overrideExpiryHours }] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: UserRole.SuperAdmin, deactivatedAt: null },
        select: { email: true },
      }),
      this.settings.thresholds(),
    ]);
    const url = `${backofficeBaseUrl()}/settings?tab=permissions`;
    for (const admin of admins) {
      try {
        await this.mailer.send(
          permissionOverrideRequestEmail({
            to: admin.email,
            requesterName: personName(row.user) ?? row.user.email,
            capability: row.capability,
            reason: row.reason,
            expiryHours: overrideExpiryHours,
            url,
            locale: this.tenant.primaryLocale,
            branding: this.tenant.branding,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Override request ${row.id} could not be emailed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private toDto(row: OverrideRow, now: Date): PermissionOverrideDto {
    return {
      id: row.id,
      userId: row.userId,
      userName: row.user.fullName,
      userEmail: row.user.email,
      userRole: row.user.role as PermissionOverrideDto['userRole'],
      capability: row.capability as PermissionCapability,
      reason: row.reason,
      status: overrideStatus(row, now),
      requestedAt: row.requestedAt.toISOString(),
      decidedByName: personName(row.decidedBy),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      endedByName: personName(row.endedBy),
      endedAt: row.endedAt?.toISOString() ?? null,
      endNote: row.endNote,
    };
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    action: string,
    entityId: string,
    metadata: Prisma.InputJsonObject,
  ) {
    return tx.auditLog.create({
      data: { actorUserId: actor.id, action, entityType: ENTITY, entityId, metadata },
    });
  }
}
