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
import { Prisma } from '@ota/db';
import {
  ADVISORY_AFFECTED_STATUSES,
  ADVISORY_NOTICE_DAYS,
  CUBA_PROVINCE_NAMES,
  advisoryApprovalDecision,
  advisoryApprovalRefusal,
  advisoryDisplayStatus,
  advisoryMissingTranslations,
  advisoryRecipients,
  advisoryReference,
  advisoryVersionReference,
  advisoryWindowIssue,
  compareAdvisories,
  cubaProvinceCode,
  isAdvisoryActive,
  pickAdvisoryTranslation,
  type AdvisoryBooking,
  type AdvisorySeverity,
  type AdvisoryStatus,
} from '@ota/domain';
import { travelAdvisoryEmail, type Mailer } from '@ota/email';
import type {
  AdvisoryAcknowledgementDto,
  AdvisoryAcknowledgementsDto,
  AdvisoryDto,
  AdvisoryHistoryQuery,
  AdvisoryListItemDto,
  AdvisoryListQuery,
  AdvisoryWriteRequest,
  PublicAdvisoryDto,
  PublicAdvisoryQuery,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { accountReservationUrl, storefrontPageUrl } from '../common/storefront-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

const DAY_MS = 86_400_000;
/** Ended advisories older than this leave the public history. */
const HISTORY_HORIZON_MS = 365 * DAY_MS;
/** Reference allocation is retried on a unique clash this many times. */
const REFERENCE_ATTEMPTS = 5;
const DELIVERED = 'advisory.delivered';

const INCLUDE = {
  translations: { orderBy: { locale: 'asc' } },
  approvals: {
    orderBy: { createdAt: 'asc' },
    include: { approver: { select: { fullName: true, email: true } } },
  },
  createdBy: { select: { fullName: true, email: true } },
  supersedes: { select: { reference: true } },
  supersededBy: { select: { id: true } },
  disruptionCase: { select: { id: true, reference: true } },
} satisfies Prisma.AdvisoryInclude;

type AdvisoryRow = Prisma.AdvisoryGetPayload<{ include: typeof INCLUDE }>;

type PublicRow = Prisma.AdvisoryGetPayload<{ include: { translations: true } }>;

function personName(
  user: { fullName: string | null; email: string } | null,
): string | null {
  return user ? (user.fullName ?? user.email) : null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * M7 travel advisories (`docs/schema-m7-advisories.md`): the desk drafts,
 * approves, versions and lifts them; travelers read the active ones in their
 * language and acknowledge a critical one. Publication emails E-Advisory to
 * the travelers whose secured trips it reaches, once each, with the audit log
 * as the delivery ledger (D5). Every desk step is audited.
 */
@Injectable()
export class AdvisoriesService {
  private readonly logger = new Logger(AdvisoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    private readonly settings: OperatingSettingsService,
  ) {}

  /** The lowest severity that needs two approvals, as set in M9 (CRITICAL by default). */
  private async dualFrom() {
    return (await this.settings.thresholds()).advisoryDualApprovalFrom;
  }

  async list(query: AdvisoryListQuery): Promise<AdvisoryListItemDto[]> {
    const now = new Date();
    const rows = await this.prisma.advisory.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 500,
      include: INCLUDE,
    });
    return rows
      .map((row) => this.toListItem(row, now))
      .filter((item) => !query.status || item.displayStatus === query.status)
      .slice(0, query.limit);
  }

  async get(id: string): Promise<AdvisoryDto> {
    return this.toDto(await this.load(id), new Date());
  }

  /** `links.disruptionCaseId` ties the draft to the M8 case whose banner it is (D7). */
  async create(
    actor: AuthUser,
    input: AdvisoryWriteRequest,
    links: { disruptionCaseId?: string } = {},
  ): Promise<AdvisoryDto> {
    const year = new Date().getUTCFullYear();
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
      const issued = await this.prisma.advisory.count({
        where: { reference: { startsWith: `ADV-${year}-` }, supersedesId: null },
      });
      const reference = advisoryReference(year, issued + 1 + attempt);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const advisory = await tx.advisory.create({
            data: {
              reference,
              ...this.document(input),
              createdById: actor.id,
              disruptionCaseId: links.disruptionCaseId ?? null,
              translations: { create: this.translations(input) },
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'advisory.created',
              entityType: 'Advisory',
              entityId: advisory.id,
              metadata: { reference, severity: input.severity, regions: input.regions },
            },
          });
          return advisory;
        });
        return this.get(created.id);
      } catch (error) {
        if (isUniqueClash(error)) continue;
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique advisory reference');
  }

  /**
   * Save a draft's whole document. Saving one that already holds a critical
   * approval returns it to DRAFT and clears the approval: it was given to
   * other words.
   */
  async update(
    actor: AuthUser,
    id: string,
    input: AdvisoryWriteRequest,
  ): Promise<AdvisoryDto> {
    const advisory = await this.load(id);
    if (advisory.status !== 'DRAFT' && advisory.status !== 'IN_REVIEW') {
      throw new ConflictException(
        `A ${advisory.status} advisory is edited through a new version`,
      );
    }
    const cleared = advisory.approvals.length;
    await this.prisma.$transaction([
      this.prisma.advisoryApproval.deleteMany({ where: { advisoryId: id } }),
      this.prisma.advisoryTranslation.deleteMany({ where: { advisoryId: id } }),
      this.prisma.advisory.update({
        where: { id },
        data: {
          ...this.document(input),
          status: 'DRAFT',
          translations: { create: this.translations(input) },
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'advisory.updated',
          entityType: 'Advisory',
          entityId: id,
          metadata: {
            reference: advisory.reference,
            severity: input.severity,
            approvalsCleared: cleared,
          },
        },
      }),
    ]);
    return this.get(id);
  }

  /**
   * "Edit (new version)" (D2): a draft copy of a published advisory that
   * supersedes it when it publishes. A version already in progress is
   * returned instead of a second one.
   */
  async createVersion(actor: AuthUser, id: string): Promise<AdvisoryDto> {
    const source = await this.load(id);
    if (source.status !== 'PUBLISHED') {
      throw new ConflictException(`A ${source.status} advisory takes no new version`);
    }
    if (source.supersededBy) {
      return this.get(source.supersededBy.id);
    }
    try {
      const version = await this.prisma.$transaction(async (tx) => {
        const created = await tx.advisory.create({
          data: {
            reference: advisoryVersionReference(source.reference),
            severity: source.severity,
            regions: source.regions,
            effectiveFrom: source.effectiveFrom,
            expiresAt: source.expiresAt,
            source: source.source,
            sourceLocale: source.sourceLocale,
            showOnSite: source.showOnSite,
            showOnPackages: source.showOnPackages,
            notifyTravelers: source.notifyTravelers,
            supersedesId: source.id,
            disruptionCaseId: source.disruptionCaseId,
            createdById: actor.id,
            translations: {
              create: source.translations.map((item) => ({
                locale: item.locale,
                headline: item.headline,
                body: item.body,
                cta: item.cta,
              })),
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'advisory.version_created',
            entityType: 'Advisory',
            entityId: created.id,
            metadata: { reference: created.reference, supersedes: source.reference },
          },
        });
        return created;
      });
      return this.get(version.id);
    } catch (error) {
      // Another desk member opened the version first.
      if (isUniqueClash(error)) {
        const again = await this.load(id);
        if (again.supersededBy) return this.get(again.supersededBy.id);
      }
      throw error;
    }
  }

  /**
   * One approval (D4). The advisory row is locked while the votes are counted,
   * so two approvers acting at once cannot both miss the publishing vote. The
   * approval that completes the rule publishes it, supersedes the version it
   * replaces and sends E-Advisory after the commit.
   */
  async approve(actor: AuthUser, id: string): Promise<AdvisoryDto> {
    const now = new Date();
    const dualFrom = await this.dualFrom();
    const published = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM advisories WHERE id = ${id}::uuid FOR UPDATE`;
      const advisory = await tx.advisory.findUnique({
        where: { id },
        include: { approvals: true, translations: { select: { locale: true } } },
      });
      if (!advisory) {
        throw new NotFoundException(`Advisory ${id} not found`);
      }
      if (advisory.status !== 'DRAFT' && advisory.status !== 'IN_REVIEW') {
        throw new ConflictException(`The advisory is already ${advisory.status}`);
      }
      const votes = advisory.approvals.map((approval) => ({
        approverId: approval.approverId ?? `removed-${approval.id}`,
        role: approval.role,
      }));
      const vote = { approverId: actor.id, role: actor.role };
      const refusal = advisoryApprovalRefusal(advisory.severity, votes, vote, dualFrom);
      if (refusal === 'ROLE') {
        throw new ForbiddenException(
          'Only an Operations Admin or a Super Admin approves',
        );
      }
      if (refusal === 'ALREADY_APPROVED') {
        throw new ConflictException('You have already approved this advisory');
      }
      if (refusal === 'ROLE_ALREADY_APPROVED') {
        throw new ConflictException(
          `A ${advisory.severity.toLowerCase()} advisory needs its second approval from the other role than ${actor.role}`,
        );
      }
      const decision = advisoryApprovalDecision(
        advisory.severity,
        [...votes, vote],
        dualFrom,
      );
      if (decision.state === 'PUBLISH') {
        this.assertPublishable(advisory, now);
      }

      await tx.advisoryApproval.create({
        data: { advisoryId: id, approverId: actor.id, role: actor.role },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'advisory.approved',
          entityType: 'Advisory',
          entityId: id,
          metadata: {
            reference: advisory.reference,
            role: actor.role,
            approvals: votes.length + 1,
          },
        },
      });
      if (decision.state === 'PENDING') {
        await tx.advisory.update({ where: { id }, data: { status: 'IN_REVIEW' } });
        return false;
      }

      await tx.advisory.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedAt: now },
      });
      if (advisory.supersedesId) {
        await tx.advisory.updateMany({
          where: { id: advisory.supersedesId, status: 'PUBLISHED' },
          data: { status: 'SUPERSEDED' },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'advisory.published',
          entityType: 'Advisory',
          entityId: id,
          metadata: {
            reference: advisory.reference,
            severity: advisory.severity,
            approvals: votes.length + 1,
            supersedes: advisory.supersedesId,
          },
        },
      });
      return true;
    });

    if (published) {
      await this.deliver(id);
    }
    return this.get(id);
  }

  /** "Request changes": back to DRAFT, approvals cleared, the note audited. */
  async requestChanges(actor: AuthUser, id: string, note: string): Promise<AdvisoryDto> {
    const advisory = await this.load(id);
    if (advisory.status !== 'IN_REVIEW' && advisory.status !== 'DRAFT') {
      throw new ConflictException(`The advisory is already ${advisory.status}`);
    }
    await this.prisma.$transaction([
      this.prisma.advisoryApproval.deleteMany({ where: { advisoryId: id } }),
      this.prisma.advisory.update({ where: { id }, data: { status: 'DRAFT' } }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'advisory.changes_requested',
          entityType: 'Advisory',
          entityId: id,
          metadata: { reference: advisory.reference, note },
        },
      }),
    ]);
    return this.get(id);
  }

  /** Lift a published advisory, scheduled or live; an expired one has ended already. */
  async lift(actor: AuthUser, id: string, note?: string): Promise<AdvisoryDto> {
    const advisory = await this.load(id);
    const now = new Date();
    const display = advisoryDisplayStatus(
      advisory.status,
      advisory.effectiveFrom,
      advisory.expiresAt,
      now,
    );
    if (display !== 'PUBLISHED' && display !== 'SCHEDULED') {
      throw new ConflictException(`A ${display} advisory cannot be lifted`);
    }
    await this.prisma.$transaction([
      this.prisma.advisory.update({
        where: { id },
        data: { status: 'LIFTED', liftedAt: now },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'advisory.lifted',
          entityType: 'Advisory',
          entityId: id,
          metadata: { reference: advisory.reference, note: note ?? null },
        },
      }),
    ]);
    return this.get(id);
  }

  /** The active advisories in one language, most severe first (public). */
  async active(query: PublicAdvisoryQuery): Promise<PublicAdvisoryDto[]> {
    const now = new Date();
    const rows = await this.prisma.advisory.findMany({
      where: {
        status: 'PUBLISHED',
        effectiveFrom: { lte: now },
        expiresAt: { gt: now },
        ...(query.province
          ? { OR: [{ regions: { isEmpty: true } }, { regions: { has: query.province } }] }
          : {}),
      },
      include: { translations: true },
    });
    return rows
      .sort(compareAdvisories)
      .flatMap((row) => this.toPublic(row, query.locale, now) ?? []);
  }

  /**
   * Ended advisories for the Current Conditions history: lifted, superseded
   * or expired in the last year, newest first (public).
   */
  async history(query: AdvisoryHistoryQuery): Promise<PublicAdvisoryDto[]> {
    const now = new Date();
    const since = new Date(now.getTime() - HISTORY_HORIZON_MS);
    const rows = await this.prisma.advisory.findMany({
      where: {
        showOnSite: true,
        OR: [
          { status: { in: ['LIFTED', 'SUPERSEDED'] }, publishedAt: { gte: since } },
          { status: 'PUBLISHED', expiresAt: { lte: now, gte: since } },
        ],
      },
      orderBy: { effectiveFrom: 'desc' },
      take: query.limit,
      include: { translations: true },
    });
    return rows.flatMap((row) => this.toPublic(row, query.locale, now) ?? []);
  }

  /** The caller's acknowledgements among the advisories active now. */
  async acknowledgements(actor: AuthUser): Promise<AdvisoryAcknowledgementsDto> {
    const now = new Date();
    const rows = await this.prisma.advisoryAcknowledgement.findMany({
      where: {
        userId: actor.id,
        advisory: { status: 'PUBLISHED', expiresAt: { gt: now } },
      },
      select: { advisoryId: true },
    });
    return { advisoryIds: rows.map((row) => row.advisoryId) };
  }

  /** D8: a signed-in traveler acknowledges an active critical advisory, once. */
  async acknowledge(actor: AuthUser, id: string): Promise<AdvisoryAcknowledgementDto> {
    const advisory = await this.prisma.advisory.findUnique({ where: { id } });
    const now = new Date();
    if (
      !advisory ||
      !isAdvisoryActive(advisory.status, advisory.effectiveFrom, advisory.expiresAt, now)
    ) {
      throw new NotFoundException(`No active advisory ${id}`);
    }
    if (advisory.severity !== 'CRITICAL') {
      throw new ConflictException('Only a critical advisory is acknowledged');
    }
    const existing = await this.prisma.advisoryAcknowledgement.findUnique({
      where: { advisoryId_userId: { advisoryId: id, userId: actor.id } },
    });
    if (existing) {
      return { advisoryId: id, acknowledgedAt: existing.createdAt.toISOString() };
    }
    try {
      const [created] = await this.prisma.$transaction([
        this.prisma.advisoryAcknowledgement.create({
          data: { advisoryId: id, userId: actor.id },
        }),
        this.prisma.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'advisory.acknowledged',
            entityType: 'Advisory',
            entityId: id,
            metadata: { reference: advisory.reference },
          },
        }),
      ]);
      return { advisoryId: id, acknowledgedAt: created.createdAt.toISOString() };
    } catch (error) {
      if (!isUniqueClash(error)) throw error;
      const again = await this.prisma.advisoryAcknowledgement.findUniqueOrThrow({
        where: { advisoryId_userId: { advisoryId: id, userId: actor.id } },
      });
      return { advisoryId: id, acknowledgedAt: again.createdAt.toISOString() };
    }
  }

  /**
   * E-Advisory (D5, D7): email each traveler the published advisory reaches
   * who has not had it yet. Each send is recorded as `advisory.delivered`,
   * which is also what makes a repeat call harmless; a failed send is logged
   * and retried by the next call. Returns how many were sent.
   */
  async deliver(id: string): Promise<number> {
    const advisory = await this.prisma.advisory.findUnique({
      where: { id },
      include: { translations: true },
    });
    if (!advisory || advisory.status !== 'PUBLISHED' || advisory.severity === 'INFO') {
      return 0;
    }
    if (!advisory.notifyTravelers) {
      return 0;
    }
    const now = new Date();
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: { in: [...ADVISORY_AFFECTED_STATUSES] },
        startDate: { lte: new Date(now.getTime() + ADVISORY_NOTICE_DAYS * DAY_MS) },
        endDate: { gte: new Date(now.getTime() - DAY_MS) },
      },
      include: {
        user: {
          select: { email: true, fullName: true, locale: true, anonymizedAt: true },
        },
        package: { select: { name: true, province: true } },
        serviceItems: { select: { province: true } },
      },
    });
    const bookings: AdvisoryBooking[] = reservations.map((reservation) => ({
      reservationId: reservation.id,
      userId: reservation.userId,
      status: reservation.status,
      startDate: reservation.startDate,
      endDate: reservation.endDate,
      provinces: [
        reservation.package?.province,
        ...reservation.serviceItems.map((item) => item.province),
      ].flatMap((name) => (name ? (cubaProvinceCode(name) ?? []) : [])),
    }));
    const recipients = advisoryRecipients(advisory, bookings, now);
    if (recipients.length === 0) {
      return 0;
    }

    const ledger = await this.prisma.auditLog.findMany({
      where: { action: DELIVERED, entityType: 'Advisory', entityId: id },
      select: { metadata: true },
    });
    const delivered = new Set(
      ledger.map((row) => (row.metadata as { userId?: string } | null)?.userId),
    );
    const byId = new Map(
      reservations.map((reservation) => [reservation.id, reservation]),
    );
    const regionNames = advisory.regions.map((code) => CUBA_PROVINCE_NAMES[code] ?? code);

    let sent = 0;
    for (const recipient of recipients) {
      if (delivered.has(recipient.userId)) continue;
      const first = byId.get(recipient.reservationIds[0]!)!;
      if (first.user.anonymizedAt) continue;
      const text = pickAdvisoryTranslation(
        advisory.translations,
        first.user.locale,
        advisory.sourceLocale,
      );
      if (!text) continue;
      try {
        await this.mailer.send(
          travelAdvisoryEmail({
            to: first.user.email,
            name: first.user.fullName ?? first.user.email,
            severity: advisory.severity === 'CRITICAL' ? 'CRITICAL' : 'CAUTION',
            headline: text.headline,
            body: text.body,
            cta: text.cta,
            source: advisory.source,
            reference: advisory.reference,
            publishedAt: advisory.publishedAt ?? now,
            expiresAt: advisory.expiresAt,
            regionNames,
            bookingCode: first.bookingCode,
            tripName: first.package?.name ?? null,
            startDate: first.startDate,
            endDate: first.endDate,
            travelInfoUrl: storefrontPageUrl(
              this.tenant,
              first.user.locale,
              '/travel-info#advisories',
            ),
            tripUrl: accountReservationUrl(this.tenant, first.user.locale, first.id),
            locale: first.user.locale,
            branding: this.tenant.branding,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `E-Advisory ${advisory.reference} could not be sent for ${first.bookingCode}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        continue;
      }
      await this.prisma.auditLog.create({
        data: {
          action: DELIVERED,
          entityType: 'Advisory',
          entityId: id,
          metadata: {
            userId: recipient.userId,
            reservationIds: recipient.reservationIds,
            bookingCode: first.bookingCode,
            reference: advisory.reference,
          },
        },
      });
      sent += 1;
    }
    return sent;
  }

  private assertPublishable(
    advisory: {
      severity: AdvisorySeverity;
      effectiveFrom: Date;
      expiresAt: Date;
      sourceLocale: string;
      translations: { locale: string }[];
    },
    now: Date,
  ): void {
    const window = advisoryWindowIssue(advisory.effectiveFrom, advisory.expiresAt, now);
    if (window === 'ALREADY_EXPIRED') {
      throw new UnprocessableEntityException('The advisory has already expired');
    }
    if (window === 'EXPIRES_BEFORE_START') {
      throw new UnprocessableEntityException('The advisory expires before it starts');
    }
    const missing = advisoryMissingTranslations(
      advisory.severity,
      advisory.sourceLocale,
      advisory.translations.map((item) => item.locale),
      this.tenant.supportedLocales,
    );
    if (missing.length > 0) {
      throw new UnprocessableEntityException(
        `Translations missing before publishing: ${missing.join(', ')}`,
      );
    }
  }

  private document(input: AdvisoryWriteRequest) {
    return {
      severity: input.severity,
      regions: input.regions,
      effectiveFrom: input.effectiveFrom,
      expiresAt: input.expiresAt,
      source: input.source,
      sourceLocale: input.sourceLocale,
      showOnSite: input.showOnSite,
      showOnPackages: input.showOnPackages,
      notifyTravelers: input.notifyTravelers,
    };
  }

  private translations(input: AdvisoryWriteRequest) {
    return input.translations.map((item) => ({
      locale: item.locale,
      headline: item.headline,
      body: item.body,
      cta: item.cta ?? null,
    }));
  }

  private async load(id: string): Promise<AdvisoryRow> {
    const advisory = await this.prisma.advisory.findUnique({
      where: { id },
      include: INCLUDE,
    });
    if (!advisory) {
      throw new NotFoundException(`Advisory ${id} not found`);
    }
    return advisory;
  }

  private toListItem(row: AdvisoryRow, now: Date): AdvisoryListItemDto {
    const headline =
      pickAdvisoryTranslation(row.translations, row.sourceLocale, row.sourceLocale)
        ?.headline ?? row.reference;
    return {
      id: row.id,
      reference: row.reference,
      severity: row.severity,
      status: row.status,
      displayStatus: advisoryDisplayStatus(
        row.status as AdvisoryStatus,
        row.effectiveFrom,
        row.expiresAt,
        now,
      ),
      regions: row.regions,
      effectiveFrom: row.effectiveFrom.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      headline,
      createdByName: personName(row.createdBy),
      approvalCount: row.approvals.length,
      supersedesId: row.supersedesId,
      publishedAt: iso(row.publishedAt),
      liftedAt: iso(row.liftedAt),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async toDto(row: AdvisoryRow, now: Date): Promise<AdvisoryDto> {
    const [deliveredCount, acknowledgementCount] = await Promise.all([
      this.prisma.auditLog.count({
        where: { action: DELIVERED, entityType: 'Advisory', entityId: row.id },
      }),
      this.prisma.advisoryAcknowledgement.count({ where: { advisoryId: row.id } }),
    ]);
    const open = row.status === 'DRAFT' || row.status === 'IN_REVIEW';
    const decision = advisoryApprovalDecision(
      row.severity,
      row.approvals.map((approval) => ({
        approverId: approval.approverId ?? `removed-${approval.id}`,
        role: approval.role,
      })),
      await this.dualFrom(),
    );
    return {
      ...this.toListItem(row, now),
      source: row.source,
      sourceLocale: row.sourceLocale,
      showOnSite: row.showOnSite,
      showOnPackages: row.showOnPackages,
      notifyTravelers: row.notifyTravelers,
      supersedesReference: row.supersedes?.reference ?? null,
      supersededById: row.supersededBy?.id ?? null,
      disruptionCase: row.disruptionCase,
      translations: row.translations.map((item) => ({
        locale: item.locale,
        headline: item.headline,
        body: item.body,
        cta: item.cta,
      })),
      approvals: row.approvals.map((approval) => ({
        approverId: approval.approverId,
        approverName: personName(approval.approver),
        role: approval.role,
        createdAt: approval.createdAt.toISOString(),
      })),
      missingApprovals: open && decision.state === 'PENDING' ? decision.missing : [],
      missingTranslations: open
        ? advisoryMissingTranslations(
            row.severity,
            row.sourceLocale,
            row.translations.map((item) => item.locale),
            this.tenant.supportedLocales,
          )
        : [],
      deliveredCount,
      acknowledgementCount,
    };
  }

  private toPublic(
    row: PublicRow,
    locale: string | undefined,
    now: Date,
  ): PublicAdvisoryDto | null {
    const text = pickAdvisoryTranslation(
      row.translations,
      locale ?? row.sourceLocale,
      row.sourceLocale,
    );
    if (!text) {
      return null;
    }
    return {
      id: row.id,
      reference: row.reference,
      severity: row.severity,
      displayStatus: advisoryDisplayStatus(
        row.status as AdvisoryStatus,
        row.effectiveFrom,
        row.expiresAt,
        now,
      ),
      regions: row.regions,
      effectiveFrom: row.effectiveFrom.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      source: row.source,
      showOnSite: row.showOnSite,
      showOnPackages: row.showOnPackages,
      locale: text.locale,
      headline: text.headline,
      body: text.body,
      cta: text.cta,
      publishedAt: iso(row.publishedAt),
      liftedAt: iso(row.liftedAt),
    };
  }
}
