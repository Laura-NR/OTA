import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import {
  DEFAULT_OPERATING_THRESHOLDS,
  changedThresholds,
  dispatchTimerPolicy,
  settingsDecisionRefusal,
  thresholdsIssues,
  type DispatchTimers,
  type OperatingThresholds,
  type RetentionPolicy,
  type SettingsDecision,
  type SettingsVersionStatus,
} from '@ota/domain';
import {
  operatingThresholdsSchema,
  type OperatingSettingsDto,
  type ProposeSettingsRequest,
  type SettingsVersionDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

/**
 * How long a process trusts its copy of the applied thresholds. The process
 * that applies a version refreshes at once; others within this time (D3).
 */
const CACHE_MS = 60_000;
const ENTITY = 'OperatingSettings';

const PERSON = { select: { fullName: true, email: true } } as const;

type VersionRow = Prisma.OperatingSettingsGetPayload<{
  include: { proposedBy: typeof PERSON; decidedBy: typeof PERSON };
}>;

interface Current {
  version: number;
  values: OperatingThresholds;
  appliedAt: Date | null;
  appliedByName: string | null;
}

const DECISION_STATUS: Record<SettingsDecision, SettingsVersionStatus> = {
  APPLY: 'APPLIED',
  REJECT: 'REJECTED',
  WITHDRAW: 'WITHDRAWN',
};

const DECISION_ACTION: Record<SettingsDecision, string> = {
  APPLY: 'settings.applied',
  REJECT: 'settings.rejected',
  WITHDRAW: 'settings.withdrawn',
};

function personName(user: { fullName: string | null; email: string } | null) {
  return user ? (user.fullName ?? user.email) : null;
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * M9 operating thresholds (`docs/schema-m9-settings.md` D1–D3): the applied
 * version is what the platform runs on; without one, the code's defaults
 * with the manifest's payment window and refund limits. A Super Admin
 * proposes, a second Super Admin applies or rejects.
 */
@Injectable()
export class OperatingSettingsService {
  private cache: { at: number; current: Current } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  /** The defaults: today's constants, with the tenant's payment terms. */
  defaults(): OperatingThresholds {
    return {
      ...DEFAULT_OPERATING_THRESHOLDS,
      paymentWindowHours: this.tenant.payments.windowHours,
      refundSingleUpTo: this.tenant.payments.refundApproval.singleUpTo,
      refundDualUpTo: this.tenant.payments.refundApproval.dualUpTo,
    };
  }

  /** The thresholds in force now. */
  async thresholds(): Promise<OperatingThresholds> {
    return (await this.current()).values;
  }

  async dispatchTimers(): Promise<DispatchTimers> {
    return dispatchTimerPolicy(await this.thresholds());
  }

  async retentionPolicy(): Promise<RetentionPolicy> {
    const values = await this.thresholds();
    return {
      triggerMonths: values.retentionTriggerMonths,
      graceDays: values.retentionGraceDays,
    };
  }

  async overview(): Promise<OperatingSettingsDto> {
    const [current, pending] = await Promise.all([
      this.current(true),
      this.prisma.operatingSettings.findFirst({
        where: { status: 'PROPOSED' },
        include: { proposedBy: PERSON, decidedBy: PERSON },
      }),
    ]);
    return {
      version: current.version,
      values: current.values,
      defaults: this.defaults(),
      appliedAt: current.appliedAt ? current.appliedAt.toISOString() : null,
      appliedByName: current.appliedByName,
      pending: pending ? this.toVersion(pending, current.values) : null,
    };
  }

  async versions(): Promise<SettingsVersionDto[]> {
    const [current, rows] = await Promise.all([
      this.current(true),
      this.prisma.operatingSettings.findMany({
        orderBy: { version: 'desc' },
        take: 50,
        include: { proposedBy: PERSON, decidedBy: PERSON },
      }),
    ]);
    return rows.map((row) => this.toVersion(row, current.values));
  }

  /** A Super Admin proposes a whole document; one proposal waits at a time. */
  async propose(
    actor: AuthUser,
    input: ProposeSettingsRequest,
  ): Promise<SettingsVersionDto> {
    const current = await this.current(true);
    const issues = thresholdsIssues(input.values, current.values);
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        message: `The proposal cannot be saved: ${issues.join(', ')}`,
        issues,
      });
    }
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.operatingSettings.findFirst({
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const created = await tx.operatingSettings.create({
          data: {
            version: (latest?.version ?? 0) + 1,
            values: input.values,
            reason: input.reason,
            proposedById: actor.id,
          },
          include: { proposedBy: PERSON, decidedBy: PERSON },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'settings.proposed',
            entityType: ENTITY,
            entityId: created.id,
            metadata: {
              version: created.version,
              changes: changedThresholds(current.values, input.values),
              reason: input.reason,
            },
          },
        });
        return created;
      });
      return this.toVersion(row, current.values);
    } catch (error) {
      if (isUniqueClash(error)) {
        throw new ConflictException(
          'A proposal is already waiting for a second Super Admin',
        );
      }
      throw error;
    }
  }

  /** Apply, reject or withdraw the pending proposal (D3). */
  async decide(
    actor: AuthUser,
    id: string,
    decision: SettingsDecision,
  ): Promise<OperatingSettingsDto> {
    const row = await this.prisma.operatingSettings.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Settings version ${id} not found`);
    }
    const refusal = settingsDecisionRefusal(
      { status: row.status, proposedById: row.proposedById },
      actor,
      decision,
    );
    if (refusal === 'NOT_PENDING') {
      throw new ConflictException('This version was already decided');
    }
    if (refusal) {
      throw new ForbiddenException(
        refusal === 'OWN_PROPOSAL'
          ? 'A second Super Admin decides a proposal'
          : refusal === 'NOT_PROPOSER'
            ? 'Only the proposer withdraws a proposal'
            : 'Only a Super Admin decides settings',
      );
    }
    const current = await this.current(true);
    const values = this.parse(row.values);
    if (decision === 'APPLY') {
      const issues = thresholdsIssues(values, current.values);
      if (issues.length > 0) {
        throw new UnprocessableEntityException({
          message: `The proposal cannot be applied: ${issues.join(', ')}`,
          issues,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.operatingSettings.updateMany({
        where: { id, status: 'PROPOSED' },
        data: {
          status: DECISION_STATUS[decision],
          decidedById: actor.id,
          decidedAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw new ConflictException('This version was already decided');
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: DECISION_ACTION[decision],
          entityType: ENTITY,
          entityId: id,
          metadata: {
            version: row.version,
            changes: changedThresholds(current.values, values),
          },
        },
      });
    });
    this.cache = null;
    return this.overview();
  }

  private async current(fresh = false): Promise<Current> {
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.current;
    }
    const row = await this.prisma.operatingSettings.findFirst({
      where: { status: 'APPLIED' },
      orderBy: { version: 'desc' },
      include: { decidedBy: PERSON },
    });
    const current: Current = row
      ? {
          version: row.version,
          values: this.parse(row.values),
          appliedAt: row.decidedAt,
          appliedByName: personName(row.decidedBy),
        }
      : { version: 0, values: this.defaults(), appliedAt: null, appliedByName: null };
    this.cache = { at: Date.now(), current };
    return current;
  }

  /**
   * A stored document over the defaults, so a threshold added after the
   * version was written still has a value.
   */
  private parse(values: Prisma.JsonValue): OperatingThresholds {
    return operatingThresholdsSchema.parse({
      ...this.defaults(),
      ...(values && typeof values === 'object' && !Array.isArray(values) ? values : {}),
    });
  }

  private toVersion(row: VersionRow, current: OperatingThresholds): SettingsVersionDto {
    const values = this.parse(row.values);
    return {
      id: row.id,
      version: row.version,
      values,
      reason: row.reason,
      status: row.status,
      proposedById: row.proposedById,
      proposedByName: personName(row.proposedBy),
      decidedByName: personName(row.decidedBy),
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      changes: changedThresholds(current, values),
    };
  }
}
