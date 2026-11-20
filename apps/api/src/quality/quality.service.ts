import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { Prisma, Review } from '@ota/db';
import { calculateSupplierReliability } from '@ota/domain';
import type {
  CreateIncidentRequest,
  IncidentDto,
  ListIncidentsQuery,
  ListReviewsQuery,
  ResolveIncidentRequest,
  ReviewDto,
  SupplierReliabilityDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import {
  ESCALATION_PUBLISHER,
  type EscalationPublisher,
} from '../escalation/escalation.publisher';
import { PrismaService } from '../prisma/prisma.service';

const INCLUDE_RESERVATION = {
  reservation: { select: { bookingCode: true } },
};

/** An incident with what the desk shows of it, a worker's report included (W-Job J5). */
const INCLUDE_INCIDENT = {
  ...INCLUDE_RESERVATION,
  supplier: {
    select: { primaryPhone: true, user: { select: { fullName: true, email: true } } },
  },
  acknowledgedBy: { select: { fullName: true, email: true } },
} satisfies Prisma.IncidentInclude;

type IncidentRow = Prisma.IncidentGetPayload<{ include: typeof INCLUDE_INCIDENT }>;

function toIncidentDto(row: IncidentRow): IncidentDto {
  return {
    id: row.id,
    reservationId: row.reservationId,
    bookingCode: row.reservation.bookingCode,
    category: row.category,
    description: row.description,
    severity: row.severity,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    source: row.source,
    serviceItemId: row.serviceItemId,
    supplierName: row.supplier
      ? (row.supplier.user.fullName ?? row.supplier.user.email)
      : null,
    supplierPhone: row.supplier?.primaryPhone ?? null,
    position:
      row.latitude !== null && row.longitude !== null
        ? {
            latitude: row.latitude.toNumber(),
            longitude: row.longitude.toNumber(),
            accuracyM: row.locationAccuracyM,
          }
        : null,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy
      ? (row.acknowledgedBy.fullName ?? row.acknowledgedBy.email)
      : null,
  };
}

/** A worker's report the desk has not acknowledged yet: a red alert (W-Job J6). */
const OPEN_EMERGENCY_WHERE = {
  source: { in: ['WORKER_APP', 'WORKER_SMS'] },
  acknowledgedAt: null,
  resolvedAt: null,
} satisfies Prisma.IncidentWhereInput;

type ReviewRow = Review & { reservation: { bookingCode: string } };

function toReviewDto(row: ReviewRow): ReviewDto {
  return {
    id: row.id,
    reservationId: row.reservationId,
    bookingCode: row.reservation.bookingCode,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Quality, experience, and duty of care (spec §4.9.4): the incident/emergency
 * log and worker reliability scorecards. Incidents are audited; reliability is
 * reduced from the dispatch-offer ledger by the pure domain helper.
 */
@Injectable()
export class QualityService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ESCALATION_PUBLISHER) private readonly escalation: EscalationPublisher,
  ) {}

  async listIncidents(query: ListIncidentsQuery): Promise<IncidentDto[]> {
    const where: Prisma.IncidentWhereInput = {};
    if (query.reservationId) where.reservationId = query.reservationId;
    if (query.resolved !== undefined) {
      where.resolvedAt = query.resolved ? { not: null } : null;
    }

    const rows = await this.prisma.incident.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: INCLUDE_INCIDENT,
    });
    return rows.map(toIncidentDto);
  }

  /** Workers' reports still waiting for the desk, oldest first: the emergency alerts. */
  async openEmergencies(): Promise<IncidentDto[]> {
    const rows = await this.prisma.incident.findMany({
      where: OPEN_EMERGENCY_WHERE,
      orderBy: { createdAt: 'asc' },
      include: INCLUDE_INCIDENT,
    });
    return rows.map(toIncidentDto);
  }

  /**
   * Someone on the desk has the emergency in hand: its alert stops for every
   * desk. A second acknowledgement returns the first.
   */
  async acknowledgeIncident(id: string, actor: AuthUser): Promise<IncidentDto> {
    const existing = await this.prisma.incident.findUnique({
      where: { id },
      include: INCLUDE_INCIDENT,
    });
    if (!existing) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    if (existing.acknowledgedAt) return toIncidentDto(existing);
    const now = new Date();
    const { count } = await this.prisma.incident.updateMany({
      where: { id, acknowledgedAt: null },
      data: { acknowledgedAt: now, acknowledgedById: actor.id },
    });
    const row = await this.prisma.incident.findUniqueOrThrow({
      where: { id },
      include: INCLUDE_INCIDENT,
    });
    if (count > 0) {
      await this.audit(actor, 'incident.acknowledged', id, {
        reservationId: row.reservationId,
      });
      this.escalation.publish({
        type: 'incident.acknowledged',
        incidentId: id,
        reservationId: row.reservationId,
        serviceItemId: row.serviceItemId,
        occurredAt: now.toISOString(),
      });
    }
    return toIncidentDto(row);
  }

  async listReviews(query: ListReviewsQuery): Promise<ReviewDto[]> {
    const where: Prisma.ReviewWhereInput = {};
    if (query.reservationId) where.reservationId = query.reservationId;

    const rows = await this.prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: INCLUDE_RESERVATION,
    });
    return rows.map(toReviewDto);
  }

  async createIncident(
    reservationId: string,
    input: CreateIncidentRequest,
    actor: AuthUser,
  ): Promise<IncidentDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        serviceItems: { select: { id: true, supplierId: true } },
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    const item = input.serviceItemId
      ? reservation.serviceItems.find((candidate) => candidate.id === input.serviceItemId)
      : undefined;
    if (input.serviceItemId && !item) {
      throw new UnprocessableEntityException('That service is not on this booking');
    }
    // A report the desk enters from a worker's SMS is in hand already (W-Job J6).
    const fromSms = input.source === 'WORKER_SMS';

    const row = await this.prisma.incident.create({
      data: {
        reservationId,
        category: input.category,
        description: input.description,
        severity: input.severity,
        source: input.source,
        serviceItemId: item?.id ?? null,
        supplierId: item?.supplierId ?? null,
        acknowledgedAt: fromSms ? new Date() : null,
        acknowledgedById: fromSms ? actor.id : null,
      },
      include: INCLUDE_INCIDENT,
    });
    await this.audit(actor, 'incident.logged', row.id, {
      reservationId,
      severity: input.severity,
      source: input.source,
    });
    return toIncidentDto(row);
  }

  async resolveIncident(
    id: string,
    input: ResolveIncidentRequest,
    actor: AuthUser,
  ): Promise<IncidentDto> {
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Incident ${id} not found`);
    }
    if (existing.resolvedAt) {
      throw new ConflictException('Incident is already resolved');
    }

    const row = await this.prisma.incident.update({
      where: { id },
      data: { resolvedAt: new Date() },
      include: INCLUDE_INCIDENT,
    });
    await this.audit(actor, 'incident.resolved', id, { note: input.note ?? null });
    return toIncidentDto(row);
  }

  async supplierReliability(): Promise<SupplierReliabilityDto[]> {
    const [offers, profiles] = await Promise.all([
      this.prisma.dispatchOffer.findMany({
        select: {
          supplierId: true,
          status: true,
          offeredAt: true,
          respondedAt: true,
        },
      }),
      this.prisma.supplierProfile.findMany({
        select: {
          id: true,
          user: { select: { fullName: true, email: true } },
        },
      }),
    ]);

    const names = new Map(
      profiles.map((profile) => [
        profile.id,
        profile.user.fullName ?? profile.user.email,
      ]),
    );

    return calculateSupplierReliability(offers).map((row) => ({
      ...row,
      supplierName: names.get(row.supplierId) ?? null,
    }));
  }

  private async audit(
    actor: AuthUser,
    action: string,
    incidentId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action,
        entityType: 'Incident',
        entityId: incidentId,
        metadata,
      },
    });
  }
}
