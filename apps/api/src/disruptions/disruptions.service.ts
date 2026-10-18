import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import {
  DISRUPTION_ARRIVAL_HOURS,
  DISRUPTION_SUGGESTED_STATUSES,
  UserRole,
  advisoryDisplayStatus,
  cubaProvinceCode,
  deskChoiceRefusal,
  disruptionCaseCounts,
  disruptionOfferState,
  disruptionReference,
  effectiveChoice,
  isTripArriving,
  isTripUnderWay,
  isUnknownOverdue,
  needsCall,
  pickAdvisoryTranslation,
  sendOptionsIssue,
  suggestDisruptionBookings,
  travelerChoiceRefusal,
  type AdvisorySeverity,
  type AdvisoryStatus,
  type DisruptionCaseRow,
  type DisruptionOffer,
  type DisruptionSeverity,
  type DisruptionTrip,
} from '@ota/domain';
import { disruptionOptionsEmail, type Mailer } from '@ota/email';
import type {
  AdvisoryDto,
  DisruptionAlertDto,
  DisruptionAttachRequest,
  DisruptionCaseBookingDto,
  DisruptionCaseDto,
  DisruptionCreateRequest,
  DisruptionDeskChoiceRequest,
  DisruptionListItemDto,
  DisruptionListQuery,
  DisruptionOptionsWriteRequest,
  DisruptionSafetyRequest,
  DisruptionSendOptionsRequest,
  DisruptionUpdateRequest,
  MeDisruptionDto,
  MeDisruptionQuery,
} from '@ota/schemas';

import { AdvisoriesService } from '../advisories/advisories.service';
import type { AuthUser } from '../common/auth/auth-user';
import { accountReservationUrl } from '../common/storefront-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Reference allocation is retried on a unique clash this many times. */
const REFERENCE_ATTEMPTS = 5;
const ENTITY = 'DisruptionCase';
/** The E-Options delivery ledger: one row per attached booking and offer. */
const DELIVERED = 'disruption.options_delivered';
/** How long a case's drafted banner stays up unless the desk changes it. */
const BANNER_DAYS = 3;

/** Who may own a case: the roles that may act on it. */
const OWNER_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/** The case's drafted banner speaks at the case's level (A-Disruption, D7). */
const BANNER_SEVERITY: Record<DisruptionSeverity, AdvisorySeverity> = {
  MINOR: 'INFO',
  MAJOR: 'CAUTION',
  EMERGENCY: 'CRITICAL',
};

const PERSON = { select: { fullName: true, email: true } } as const;

const BOOKING_INCLUDE = {
  reservation: {
    select: {
      id: true,
      bookingCode: true,
      status: true,
      startDate: true,
      endDate: true,
      partySize: true,
      userId: true,
      user: {
        select: {
          email: true,
          fullName: true,
          phone: true,
          nationality: true,
          locale: true,
          anonymizedAt: true,
        },
      },
      travelers: {
        where: { isLead: true },
        take: 1,
        select: { fullName: true, nationality: true },
      },
    },
  },
  confirmedBy: PERSON,
  chosenBy: PERSON,
} satisfies Prisma.DisruptionCaseBookingInclude;

const CASE_INCLUDE = {
  owner: PERSON,
  steps: { orderBy: { position: 'asc' }, include: { doneBy: PERSON } },
  options: { orderBy: { position: 'asc' } },
  bookings: { orderBy: { createdAt: 'asc' }, include: BOOKING_INCLUDE },
  advisories: {
    orderBy: { createdAt: 'desc' },
    include: { translations: true },
  },
} satisfies Prisma.DisruptionCaseInclude;

const LIST_INCLUDE = {
  owner: PERSON,
  bookings: { include: BOOKING_INCLUDE },
} satisfies Prisma.DisruptionCaseInclude;

type CaseRow = Prisma.DisruptionCaseGetPayload<{ include: typeof CASE_INCLUDE }>;
type ListRow = Prisma.DisruptionCaseGetPayload<{ include: typeof LIST_INCLUDE }>;
type BookingRow = Prisma.DisruptionCaseBookingGetPayload<{
  include: typeof BOOKING_INCLUDE;
}>;

function personName(
  user: { fullName: string | null; email: string } | null,
): string | null {
  return user ? (user.fullName ?? user.email) : null;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function calendarDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isUniqueClash(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function offerOf(row: {
  offerSentAt: Date | null;
  offerDeadline: Date | null;
  defaultOptionKey: string | null;
  chosenOptionKey: string | null;
  choiceSource: DisruptionOffer['choiceSource'];
  chosenAt: Date | null;
}): DisruptionOffer {
  return {
    offerSentAt: row.offerSentAt,
    offerDeadline: row.offerDeadline,
    defaultOptionKey: row.defaultOptionKey,
    chosenOptionKey: row.chosenOptionKey,
    choiceSource: row.choiceSource,
    chosenAt: row.chosenAt,
  };
}

function caseRow(row: BookingRow): DisruptionCaseRow {
  return {
    ...offerOf(row),
    safety: row.safety,
    lastContactAt: row.lastContactAt,
    attachedAt: row.createdAt,
    startDate: row.reservation.startDate,
    endDate: row.reservation.endDate,
  };
}

/**
 * M8 disruption cases (`docs/schema-m8-disruptions.md`, approved D1a–D9a). A
 * case opens from a manifest scenario and copies its playbook; the desk
 * attaches bookings, sets the severity, sends one option set with a deadline
 * and tracks each party on the status board. The default after the deadline
 * and the red "Unknown" are derived on read; nothing is written by a job.
 * Every step is audited against the case, which is also its log (D8).
 */
@Injectable()
export class DisruptionsService {
  private readonly logger = new Logger(DisruptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly advisories: AdvisoriesService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async list(query: DisruptionListQuery): Promise<DisruptionListItemDto[]> {
    const now = new Date();
    const rows = await this.prisma.disruptionCase.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ status: 'desc' }, { openedAt: 'desc' }],
      take: query.limit,
      include: LIST_INCLUDE,
    });
    return rows.map((row) => this.toListItem(row, now));
  }

  async get(id: string): Promise<DisruptionCaseDto> {
    const row = await this.load(id);
    const now = new Date();
    const [suggestions, log] = await Promise.all([
      row.status === 'OPEN' ? this.suggestions(row, now) : Promise.resolve([]),
      this.prisma.auditLog.findMany({
        where: { entityType: ENTITY, entityId: id },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { actor: PERSON },
      }),
    ]);
    const scenario = this.scenario(row.scenario);
    return {
      ...this.toListItem(row, now),
      summary: row.summary,
      policy: row.policy,
      trigger: scenario?.trigger ?? null,
      steps: row.steps.map((step) => ({
        id: step.id,
        position: step.position,
        text: step.text,
        owner: step.owner,
        due: step.due,
        doneAt: iso(step.doneAt),
        doneByName: personName(step.doneBy),
      })),
      options: row.options.map((option) => ({
        key: option.key,
        position: option.position,
        title: option.title,
        detail: option.detail,
      })),
      optionsLocked: row.bookings.some((booking) => booking.offerSentAt !== null),
      bookings: row.bookings.map((booking) => this.toBooking(row.severity, booking, now)),
      suggestions,
      advisories: row.advisories.map((advisory) => ({
        id: advisory.id,
        reference: advisory.reference,
        severity: advisory.severity,
        displayStatus: advisoryDisplayStatus(
          advisory.status as AdvisoryStatus,
          advisory.effectiveFrom,
          advisory.expiresAt,
          now,
        ),
        headline:
          pickAdvisoryTranslation(
            advisory.translations,
            advisory.sourceLocale,
            advisory.sourceLocale,
          )?.headline ?? advisory.reference,
      })),
      log: log.map((entry) => ({
        id: entry.id,
        action: entry.action,
        actorName: personName(entry.actor),
        createdAt: entry.createdAt.toISOString(),
        metadata:
          entry.metadata &&
          typeof entry.metadata === 'object' &&
          !Array.isArray(entry.metadata)
            ? (entry.metadata as Record<string, unknown>)
            : null,
      })),
    };
  }

  /**
   * Open a case from a manifest scenario: its steps, options and compensation
   * rule are copied now (D1), so a later manifest edit never rewrites it. The
   * opener owns the case.
   */
  async create(
    actor: AuthUser,
    input: DisruptionCreateRequest,
  ): Promise<DisruptionCaseDto> {
    const scenario = this.scenario(input.scenario);
    if (!scenario) {
      throw new UnprocessableEntityException(`Unknown scenario ${input.scenario}`);
    }
    const reservations = await this.reservationsByIds(input.reservationIds);
    for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
      const issued = await this.prisma.disruptionCase.count();
      const reference = disruptionReference(issued + 1 + attempt);
      try {
        const created = await this.prisma.$transaction(async (tx) => {
          const opened = await tx.disruptionCase.create({
            data: {
              reference,
              scenario: scenario.key,
              severity: input.severity,
              province: input.province,
              title: input.title,
              summary: input.summary,
              policy: scenario.policy,
              ownerId: actor.id,
              steps: {
                create: scenario.steps.map((step, position) => ({
                  position,
                  text: step.text,
                  owner: step.owner,
                  due: step.due,
                })),
              },
              options: {
                create: scenario.options.map((option, position) => ({
                  key: option.key,
                  position,
                  title: option.title,
                  detail: option.detail,
                })),
              },
              bookings: {
                create: reservations.map((reservation) => ({
                  reservationId: reservation.id,
                })),
              },
            },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: actor.id,
              action: 'disruption.opened',
              entityType: ENTITY,
              entityId: opened.id,
              metadata: {
                reference,
                scenario: scenario.key,
                severity: input.severity,
                province: input.province,
              },
            },
          });
          for (const reservation of reservations) {
            await tx.auditLog.create({
              data: {
                actorUserId: actor.id,
                action: 'disruption.booking_attached',
                entityType: ENTITY,
                entityId: opened.id,
                metadata: {
                  reservationId: reservation.id,
                  bookingCode: reservation.bookingCode,
                },
              },
            });
          }
          return opened;
        });
        return this.get(created.id);
      } catch (error) {
        if (isUniqueClash(error)) continue;
        throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique case reference');
  }

  /** Severity, owner and texts change at any time on an open case (D3); closing ends it. */
  async update(
    actor: AuthUser,
    id: string,
    input: DisruptionUpdateRequest,
  ): Promise<DisruptionCaseDto> {
    const row = await this.loadOpen(id);
    if (input.ownerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: input.ownerId },
        select: { role: true },
      });
      if (!owner || !OWNER_ROLES.includes(owner.role)) {
        throw new UnprocessableEntityException(
          'A case is owned by an Operations Admin or a Super Admin',
        );
      }
    }
    const now = new Date();
    const audits: Prisma.AuditLogCreateManyInput[] = [];
    const audit = (action: string, metadata: Prisma.InputJsonObject) =>
      audits.push({
        actorUserId: actor.id,
        action,
        entityType: ENTITY,
        entityId: id,
        metadata: { reference: row.reference, ...metadata },
      });
    if (input.severity && input.severity !== row.severity) {
      audit('disruption.severity_changed', { from: row.severity, to: input.severity });
    }
    if (input.ownerId !== undefined && input.ownerId !== row.ownerId) {
      audit('disruption.owner_changed', { ownerId: input.ownerId });
    }
    if (
      (input.title !== undefined && input.title !== row.title) ||
      (input.summary !== undefined && input.summary !== row.summary)
    ) {
      audit('disruption.updated', {});
    }
    if (input.close) {
      audit('disruption.closed', {});
    }
    await this.prisma.$transaction([
      this.prisma.disruptionCase.update({
        where: { id },
        data: {
          ...(input.severity ? { severity: input.severity } : {}),
          ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.close ? { status: 'CLOSED' as const, closedAt: now } : {}),
        },
      }),
      this.prisma.auditLog.createMany({ data: audits }),
    ]);
    return this.get(id);
  }

  async completeStep(
    actor: AuthUser,
    id: string,
    stepId: string,
  ): Promise<DisruptionCaseDto> {
    const row = await this.loadOpen(id);
    const step = row.steps.find((item) => item.id === stepId);
    if (!step) {
      throw new NotFoundException(`Step ${stepId} is not in case ${row.reference}`);
    }
    if (step.doneAt) {
      throw new ConflictException('The step is already done');
    }
    await this.prisma.$transaction([
      this.prisma.disruptionStep.update({
        where: { id: stepId },
        data: { doneAt: new Date(), doneById: actor.id },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'disruption.step_done',
          entityType: ENTITY,
          entityId: id,
          metadata: {
            reference: row.reference,
            position: step.position,
            text: step.text,
          },
        },
      }),
    ]);
    return this.get(id);
  }

  /** Attach bookings by id or booking code; ones already attached are left as they are. */
  async attach(
    actor: AuthUser,
    id: string,
    input: DisruptionAttachRequest,
  ): Promise<DisruptionCaseDto> {
    const row = await this.loadOpen(id);
    const byId = await this.reservationsByIds(input.reservationIds);
    const codes = [...new Set(input.bookingCodes.map((code) => code.toUpperCase()))];
    const byCode = codes.length
      ? await this.prisma.reservation.findMany({
          where: { bookingCode: { in: codes } },
          select: { id: true, bookingCode: true },
        })
      : [];
    const unknown = codes.filter(
      (code) => !byCode.some((item) => item.bookingCode === code),
    );
    if (unknown.length > 0) {
      throw new NotFoundException(`No booking ${unknown.join(', ')}`);
    }
    const attached = new Set(row.bookings.map((booking) => booking.reservationId));
    const fresh = [...byId, ...byCode].filter(
      (reservation, index, all) =>
        !attached.has(reservation.id) &&
        all.findIndex((other) => other.id === reservation.id) === index,
    );
    if (fresh.length > 0) {
      await this.prisma.$transaction([
        this.prisma.disruptionCaseBooking.createMany({
          data: fresh.map((reservation) => ({
            caseId: id,
            reservationId: reservation.id,
          })),
          skipDuplicates: true,
        }),
        this.prisma.auditLog.createMany({
          data: fresh.map((reservation) => ({
            actorUserId: actor.id,
            action: 'disruption.booking_attached',
            entityType: ENTITY,
            entityId: id,
            metadata: {
              reservationId: reservation.id,
              bookingCode: reservation.bookingCode,
            },
          })),
        }),
      ]);
    }
    return this.get(id);
  }

  /** Replace the case's option set; it is fixed once any booking was sent it (D4). */
  async writeOptions(
    actor: AuthUser,
    id: string,
    input: DisruptionOptionsWriteRequest,
  ): Promise<DisruptionCaseDto> {
    const row = await this.loadOpen(id);
    if (row.bookings.some((booking) => booking.offerSentAt !== null)) {
      throw new ConflictException('The options were sent and are now fixed');
    }
    await this.prisma.$transaction([
      this.prisma.disruptionOption.deleteMany({ where: { caseId: id } }),
      this.prisma.disruptionOption.createMany({
        data: input.options.map((option, position) => ({
          caseId: id,
          key: option.key,
          position,
          title: option.title,
          detail: option.detail,
        })),
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'disruption.options_updated',
          entityType: ENTITY,
          entityId: id,
          metadata: {
            reference: row.reference,
            keys: input.options.map((option) => option.key),
          },
        },
      }),
    ]);
    return this.get(id);
  }

  /**
   * Send the options to the listed bookings: each gets an offer with the
   * deadline and the default, replacing an earlier unanswered one (an
   * extension). A booking whose answer is recorded keeps it; the desk changes
   * it by recording another. E-Options goes out after the commit.
   */
  async sendOptions(
    actor: AuthUser,
    id: string,
    input: DisruptionSendOptionsRequest,
  ): Promise<DisruptionCaseDto> {
    const row = await this.loadOpen(id);
    const now = new Date();
    const issue = sendOptionsIssue(
      row.status,
      row.options.map((option) => option.key),
      input.defaultOptionKey,
      input.deadline,
      now,
    );
    if (issue === 'NO_OPTIONS') {
      throw new UnprocessableEntityException('The case has no options to send');
    }
    if (issue === 'UNKNOWN_DEFAULT') {
      throw new UnprocessableEntityException(
        `Option ${input.defaultOptionKey} is not one of the case's options`,
      );
    }
    if (issue === 'DEADLINE_PAST') {
      throw new UnprocessableEntityException('The deadline must be in the future');
    }
    const targets = [...new Set(input.reservationIds)].map((reservationId) => {
      const booking = row.bookings.find((item) => item.reservationId === reservationId);
      if (!booking) {
        throw new NotFoundException(
          `Booking ${reservationId} is not attached to the case`,
        );
      }
      return booking;
    });
    const answered = targets.filter((booking) => booking.chosenOptionKey !== null);
    if (answered.length > 0) {
      throw new ConflictException(
        `Already answered: ${answered.map((booking) => booking.reservation.bookingCode).join(', ')}`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.disruptionCaseBooking.updateMany({
        where: {
          id: { in: targets.map((booking) => booking.id) },
          chosenOptionKey: null,
        },
        data: {
          offerSentAt: now,
          offerDeadline: input.deadline,
          defaultOptionKey: input.defaultOptionKey,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'disruption.options_sent',
          entityType: ENTITY,
          entityId: id,
          metadata: {
            reference: row.reference,
            reservationIds: targets.map((booking) => booking.reservationId),
            bookingCodes: targets.map((booking) => booking.reservation.bookingCode),
            deadline: input.deadline.toISOString(),
            defaultOptionKey: input.defaultOptionKey,
          },
        },
      }),
    ]);
    await this.deliver(id);
    return this.get(id);
  }

  /**
   * E-Options: email every attached booking's current offer that has not been
   * emailed yet. The ledger row (`disruption.options_delivered`, keyed by the
   * booking row and the offer's sent time) makes a repeat call harmless; a
   * failed send is logged, not recorded, so the next pass retries it.
   */
  async deliver(id: string): Promise<number> {
    const row = await this.load(id);
    if (row.status !== 'OPEN') {
      return 0;
    }
    const ledger = await this.prisma.auditLog.findMany({
      where: { action: DELIVERED, entityType: ENTITY, entityId: id },
      select: { metadata: true },
    });
    const delivered = new Set(
      ledger.map((entry) => {
        const metadata = entry.metadata as {
          caseBookingId?: string;
          offerSentAt?: string;
        };
        return `${metadata?.caseBookingId}@${metadata?.offerSentAt}`;
      }),
    );
    let sent = 0;
    for (const booking of row.bookings) {
      if (!booking.offerSentAt || !booking.offerDeadline || !booking.defaultOptionKey) {
        continue;
      }
      const offerSentAt = booking.offerSentAt.toISOString();
      if (delivered.has(`${booking.id}@${offerSentAt}`)) continue;
      const reservation = booking.reservation;
      const user = reservation.user;
      if (user.anonymizedAt) continue;
      try {
        await this.mailer.send(
          disruptionOptionsEmail({
            to: user.email,
            name: reservation.travelers[0]?.fullName ?? user.fullName ?? user.email,
            severity: row.severity,
            title: row.title,
            summary: row.summary,
            options: row.options,
            defaultOptionKey: booking.defaultOptionKey,
            deadline: booking.offerDeadline,
            policy: row.policy,
            reference: row.reference,
            bookingCode: reservation.bookingCode,
            sentAt: booking.offerSentAt,
            tripUrl: `${accountReservationUrl(this.tenant, user.locale, reservation.id)}#disruption-options`,
            locale: user.locale,
            branding: this.tenant.branding,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `E-Options ${row.reference} could not be sent for ${reservation.bookingCode}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        continue;
      }
      await this.prisma.auditLog.create({
        data: {
          action: DELIVERED,
          entityType: ENTITY,
          entityId: id,
          metadata: {
            caseBookingId: booking.id,
            offerSentAt,
            reservationId: reservation.id,
            bookingCode: reservation.bookingCode,
            reference: row.reference,
          },
        },
      });
      sent += 1;
    }
    return sent;
  }

  /** "Marking safe records who confirmed and how" (D6); the note says how. */
  async markSafety(
    actor: AuthUser,
    id: string,
    reservationId: string,
    input: DisruptionSafetyRequest,
  ): Promise<DisruptionCaseDto> {
    const row = await this.loadOpen(id);
    const booking = this.attached(row, reservationId);
    const contactAt = input.contactAt ?? new Date();
    await this.prisma.$transaction([
      this.prisma.disruptionCaseBooking.update({
        where: { id: booking.id },
        data: {
          safety: input.safety,
          lastContactAt: contactAt,
          safetyNote: input.note ?? null,
          safetyConfirmedBy: actor.id,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'disruption.safety_marked',
          entityType: ENTITY,
          entityId: id,
          metadata: {
            reference: row.reference,
            reservationId,
            bookingCode: booking.reservation.bookingCode,
            safety: input.safety,
            contactAt: contactAt.toISOString(),
            note: input.note ?? null,
          },
        },
      }),
    ]);
    return this.get(id);
  }

  /**
   * The desk records an answer given by phone (DESK), at any time on an open
   * case, or confirms the default after the deadline (DEFAULT). It executes
   * the choice with the existing tools (D5).
   */
  async recordDeskChoice(
    actor: AuthUser,
    id: string,
    reservationId: string,
    input: DisruptionDeskChoiceRequest,
  ): Promise<DisruptionCaseDto> {
    const row = await this.loadOpen(id);
    const booking = this.attached(row, reservationId);
    const now = new Date();
    const refusal = deskChoiceRefusal(
      row.status,
      offerOf(booking),
      row.options.map((option) => option.key),
      input.key,
      input.source,
      now,
    );
    if (refusal === 'NOT_OFFERED') {
      throw new ConflictException('The options were not sent to this booking');
    }
    if (refusal === 'UNKNOWN_OPTION') {
      throw new UnprocessableEntityException(`Option ${input.key} is not offered`);
    }
    if (refusal === 'NOT_DEFAULT') {
      throw new UnprocessableEntityException(
        `Option ${input.key} is not this booking's default`,
      );
    }
    if (refusal === 'DEADLINE_NOT_PASSED') {
      throw new ConflictException('The default applies only after the deadline');
    }
    await this.prisma.$transaction([
      this.prisma.disruptionCaseBooking.update({
        where: { id: booking.id },
        data: {
          chosenOptionKey: input.key,
          choiceSource: input.source,
          chosenAt: now,
          chosenById: actor.id,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'disruption.choice_recorded',
          entityType: ENTITY,
          entityId: id,
          metadata: {
            reference: row.reference,
            reservationId,
            bookingCode: booking.reservation.bookingCode,
            key: input.key,
            source: input.source,
            previous: booking.chosenOptionKey,
          },
        },
      }),
    ]);
    return this.get(id);
  }

  /**
   * The case drafts its public banner as an ordinary M7 advisory, linked to
   * the case and approved by M7's rules (D7). A draft or review already
   * linked is returned instead of a second one.
   */
  async draftAdvisory(actor: AuthUser, id: string): Promise<AdvisoryDto> {
    const row = await this.loadOpen(id);
    const pending = row.advisories.find(
      (advisory) => advisory.status === 'DRAFT' || advisory.status === 'IN_REVIEW',
    );
    if (pending) {
      return this.advisories.get(pending.id);
    }
    const now = new Date();
    const sourceLocale = this.tenant.supportedLocales.includes('en')
      ? 'en'
      : this.tenant.primaryLocale;
    const severity = BANNER_SEVERITY[row.severity];
    const advisory = await this.advisories.create(
      actor,
      {
        severity,
        regions: row.province ? [row.province] : [],
        effectiveFrom: now,
        expiresAt: new Date(now.getTime() + BANNER_DAYS * DAY_MS),
        source: this.tenant.branding.agencyName,
        sourceLocale,
        showOnSite: true,
        showOnPackages: true,
        notifyTravelers: severity !== 'INFO',
        translations: [
          { locale: sourceLocale, headline: row.title.slice(0, 160), body: row.summary },
        ],
      },
      { disruptionCaseId: id },
    );
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'disruption.advisory_drafted',
        entityType: ENTITY,
        entityId: id,
        metadata: {
          reference: row.reference,
          advisoryId: advisory.id,
          advisoryReference: advisory.reference,
        },
      },
    });
    return advisory;
  }

  /** The dashboard alert: open cases, red Unknowns, calls due and parties needing help. */
  async alerts(): Promise<DisruptionAlertDto> {
    const now = new Date();
    const rows = await this.prisma.disruptionCase.findMany({
      where: { status: 'OPEN' },
      include: LIST_INCLUDE,
    });
    const counts = rows.map((row) =>
      disruptionCaseCounts(row.severity, row.bookings.map(caseRow), now),
    );
    return {
      openCases: rows.length,
      overdueUnknown: counts.reduce((sum, item) => sum + item.overdueUnknown, 0),
      callNow: counts.reduce((sum, item) => sum + item.callNow, 0),
      needsHelp: counts.reduce((sum, item) => sum + item.needsHelp, 0),
    };
  }

  /** The caller's offers on open cases, for the trip page (D4). */
  async mine(actor: AuthUser, query: MeDisruptionQuery): Promise<MeDisruptionDto[]> {
    const now = new Date();
    const rows = await this.prisma.disruptionCaseBooking.findMany({
      where: {
        offerSentAt: { not: null },
        reservation: {
          userId: actor.id,
          ...(query.reservationId ? { id: query.reservationId } : {}),
        },
        case: { status: 'OPEN' },
      },
      orderBy: { offerSentAt: 'desc' },
      include: {
        reservation: { select: { id: true, bookingCode: true } },
        case: { include: { options: { orderBy: { position: 'asc' } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      caseId: row.caseId,
      reference: row.case.reference,
      reservationId: row.reservation.id,
      bookingCode: row.reservation.bookingCode,
      title: row.case.title,
      summary: row.case.summary,
      severity: row.case.severity,
      policy: row.case.policy,
      options: row.case.options.map((option) => ({
        key: option.key,
        position: option.position,
        title: option.title,
        detail: option.detail,
      })),
      offerSentAt: iso(row.offerSentAt),
      offerDeadline: iso(row.offerDeadline),
      defaultOptionKey: row.defaultOptionKey,
      chosenOptionKey: row.chosenOptionKey,
      choiceSource: row.choiceSource,
      chosenAt: iso(row.chosenAt),
      offerState: disruptionOfferState(offerOf(row), now),
      effectiveChoice: effectiveChoice(offerOf(row), now),
    }));
  }

  /**
   * The traveler's answer (D4): once, before the deadline, on an open case.
   * The write is conditional on both, so a concurrent desk answer or the
   * deadline passing between the read and the write cannot be overwritten.
   */
  async choose(
    actor: AuthUser,
    caseBookingId: string,
    key: string,
  ): Promise<MeDisruptionDto> {
    const booking = await this.prisma.disruptionCaseBooking.findUnique({
      where: { id: caseBookingId },
      include: {
        reservation: { select: { userId: true, bookingCode: true } },
        case: { include: { options: true } },
      },
    });
    if (!booking || booking.reservation.userId !== actor.id) {
      throw new NotFoundException(`No disruption offer ${caseBookingId}`);
    }
    const now = new Date();
    const refusal = travelerChoiceRefusal(
      booking.case.status,
      offerOf(booking),
      booking.case.options.map((option) => option.key),
      key,
      now,
    );
    if (refusal === 'NOT_OFFERED' || refusal === 'CASE_CLOSED') {
      throw new NotFoundException(`No disruption offer ${caseBookingId}`);
    }
    if (refusal === 'ALREADY_CHOSEN') {
      throw new ConflictException(
        'An answer is already recorded; call the desk to change it',
      );
    }
    if (refusal === 'DEADLINE_PASSED') {
      throw new ConflictException('The deadline has passed; the desk will call you');
    }
    if (refusal === 'UNKNOWN_OPTION') {
      throw new UnprocessableEntityException(`Option ${key} is not offered`);
    }
    const written = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.disruptionCaseBooking.updateMany({
        where: {
          id: caseBookingId,
          chosenOptionKey: null,
          offerDeadline: { gt: now },
          case: { status: 'OPEN' },
        },
        data: {
          chosenOptionKey: key,
          choiceSource: 'TRAVELER',
          chosenAt: now,
          chosenById: actor.id,
        },
      });
      if (count === 0) return false;
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'disruption.choice_recorded',
          entityType: ENTITY,
          entityId: booking.caseId,
          metadata: {
            reference: booking.case.reference,
            reservationId: booking.reservationId,
            bookingCode: booking.reservation.bookingCode,
            key,
            source: 'TRAVELER',
          },
        },
      });
      return true;
    });
    if (!written) {
      throw new ConflictException('The offer changed; reload the page');
    }
    const [mine] = (
      await this.mine(actor, { reservationId: booking.reservationId })
    ).filter((item) => item.id === caseBookingId);
    if (!mine) {
      throw new NotFoundException(`No disruption offer ${caseBookingId}`);
    }
    return mine;
  }

  private scenario(key: string) {
    return (
      this.tenant.disruptions.scenarios.find((scenario) => scenario.key === key) ?? null
    );
  }

  private async reservationsByIds(ids: readonly string[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await this.prisma.reservation.findMany({
      where: { id: { in: unique } },
      select: { id: true, bookingCode: true },
    });
    const missing = unique.filter((id) => !rows.some((row) => row.id === id));
    if (missing.length > 0) {
      throw new NotFoundException(`No booking ${missing.join(', ')}`);
    }
    return rows;
  }

  /**
   * Secured trips visiting the case's province, under way or arriving within
   * 72 h, not attached yet (D2).
   */
  private async suggestions(row: CaseRow, now: Date) {
    if (!row.province) return [];
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: { in: [...DISRUPTION_SUGGESTED_STATUSES] },
        startDate: { lte: new Date(now.getTime() + DISRUPTION_ARRIVAL_HOURS * HOUR_MS) },
        endDate: { gte: new Date(now.getTime() - DAY_MS) },
      },
      include: {
        user: { select: { fullName: true, email: true, anonymizedAt: true } },
        travelers: { where: { isLead: true }, take: 1, select: { fullName: true } },
        package: { select: { province: true } },
        serviceItems: { select: { province: true } },
      },
    });
    const trips: (DisruptionTrip & { row: (typeof reservations)[number] })[] =
      reservations.map((reservation) => ({
        reservationId: reservation.id,
        status: reservation.status,
        startDate: reservation.startDate,
        endDate: reservation.endDate,
        provinces: [
          reservation.package?.province,
          ...reservation.serviceItems.map((item) => item.province),
        ].flatMap((name) => (name ? (cubaProvinceCode(name) ?? []) : [])),
        row: reservation,
      }));
    return suggestDisruptionBookings(
      row.province,
      trips,
      row.bookings.map((booking) => booking.reservationId),
      now,
    ).map((trip) => ({
      reservationId: trip.reservationId,
      bookingCode: trip.row.bookingCode,
      status: trip.status,
      travelerName: trip.row.user.anonymizedAt
        ? null
        : (trip.row.travelers[0]?.fullName ??
          trip.row.user.fullName ??
          trip.row.user.email),
      startDate: calendarDay(trip.startDate),
      endDate: calendarDay(trip.endDate),
      underWay: isTripUnderWay(trip, now),
    }));
  }

  private attached(row: CaseRow, reservationId: string) {
    const booking = row.bookings.find((item) => item.reservationId === reservationId);
    if (!booking) {
      throw new NotFoundException(`Booking ${reservationId} is not attached to the case`);
    }
    return booking;
  }

  private async load(id: string): Promise<CaseRow> {
    const row = await this.prisma.disruptionCase.findUnique({
      where: { id },
      include: CASE_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Disruption case ${id} not found`);
    }
    return row;
  }

  private async loadOpen(id: string): Promise<CaseRow> {
    const row = await this.load(id);
    if (row.status !== 'OPEN') {
      throw new ConflictException(`Case ${row.reference} is closed`);
    }
    return row;
  }

  private toListItem(row: ListRow | CaseRow, now: Date): DisruptionListItemDto {
    return {
      id: row.id,
      reference: row.reference,
      scenario: row.scenario,
      scenarioLabel: this.scenario(row.scenario)?.label ?? null,
      severity: row.severity,
      status: row.status,
      province: row.province,
      title: row.title,
      ownerId: row.ownerId,
      ownerName: personName(row.owner),
      openedAt: row.openedAt.toISOString(),
      closedAt: iso(row.closedAt),
      counts: disruptionCaseCounts(row.severity, row.bookings.map(caseRow), now),
    };
  }

  private toBooking(
    severity: DisruptionSeverity,
    row: BookingRow,
    now: Date,
  ): DisruptionCaseBookingDto {
    const reservation = row.reservation;
    const user = reservation.user;
    const lead = reservation.travelers[0];
    const anonymized = user.anonymizedAt !== null;
    const offer = offerOf(row);
    const state = caseRow(row);
    return {
      id: row.id,
      reservationId: reservation.id,
      bookingCode: reservation.bookingCode,
      status: reservation.status,
      travelerName: anonymized ? null : (lead?.fullName ?? user.fullName ?? user.email),
      travelerEmail: anonymized ? null : user.email,
      travelerPhone: anonymized ? null : user.phone,
      nationality: lead?.nationality ?? user.nationality,
      partySize: reservation.partySize,
      startDate: calendarDay(reservation.startDate),
      endDate: calendarDay(reservation.endDate),
      underWay: isTripUnderWay(reservation, now),
      arriving: isTripArriving(reservation, now),
      attachedAt: row.createdAt.toISOString(),
      safety: row.safety,
      lastContactAt: iso(row.lastContactAt),
      safetyNote: row.safetyNote,
      safetyConfirmedByName: personName(row.confirmedBy),
      overdueUnknown: isUnknownOverdue(severity, state, now),
      offerSentAt: iso(row.offerSentAt),
      offerDeadline: iso(row.offerDeadline),
      defaultOptionKey: row.defaultOptionKey,
      chosenOptionKey: row.chosenOptionKey,
      choiceSource: row.choiceSource,
      chosenAt: iso(row.chosenAt),
      chosenByName: personName(row.chosenBy),
      offerState: disruptionOfferState(offer, now),
      effectiveChoice: effectiveChoice(offer, now),
      needsCall: needsCall(offer, now),
    };
  }
}
