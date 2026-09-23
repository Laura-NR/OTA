import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import type { Incident, Prisma, Review } from '@ota/db';
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
import { PrismaService } from '../prisma/prisma.service';

type IncidentRow = Incident & { reservation: { bookingCode: string } };

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
  };
}

const INCLUDE_RESERVATION = {
  reservation: { select: { bookingCode: true } },
};

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
  constructor(private readonly prisma: PrismaService) {}

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
      include: INCLUDE_RESERVATION,
    });
    return rows.map(toIncidentDto);
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
      select: { id: true },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const row = await this.prisma.incident.create({
      data: {
        reservationId,
        category: input.category,
        description: input.description,
        severity: input.severity,
      },
      include: INCLUDE_RESERVATION,
    });
    await this.audit(actor, 'incident.logged', row.id, {
      reservationId,
      severity: input.severity,
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
      include: INCLUDE_RESERVATION,
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
