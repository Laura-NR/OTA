import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { Prisma, Reservation } from '@ota/db';
import { ReservationStatus, assertTransition } from '@ota/domain';
import type {
  AuditLogEntryDto,
  ClassifyReservationRequest,
  CreateReservationRequest,
  ListReservationsQuery,
  ReservationDetailDto,
  ReservationDto,
  ReservationListItemDto,
  ReservationServiceItemDto,
  TransitionReservationRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { generateBookingCode } from '../common/booking-code';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';

type ListRow = Prisma.ReservationGetPayload<{
  include: {
    user: { select: { email: true; fullName: true } };
    _count: { select: { serviceItems: true } };
  };
}>;

type DetailRow = Prisma.ReservationGetPayload<{
  include: {
    user: { select: { id: true; email: true; fullName: true } };
    serviceItems: true;
  };
}>;

type AuditRow = Prisma.AuditLogGetPayload<{
  include: { actor: { select: { email: true } } };
}>;

function toDto(reservation: Reservation): ReservationDto {
  return {
    id: reservation.id,
    bookingCode: reservation.bookingCode,
    status: reservation.status as ReservationStatus,
    tourismCategory: reservation.tourismCategory,
    startDate: reservation.startDate.toISOString(),
    endDate: reservation.endDate.toISOString(),
    totalCurrency: reservation.totalCurrency,
    totalAmount: reservation.totalAmount.toString(),
    createdAt: reservation.createdAt.toISOString(),
  };
}

function toListDto(row: ListRow): ReservationListItemDto {
  return {
    ...toDto(row),
    travelerEmail: row.user.email,
    travelerName: row.user.fullName,
    serviceItemCount: row._count.serviceItems,
  };
}

function toServiceItemDto(
  item: DetailRow['serviceItems'][number],
): ReservationServiceItemDto {
  return {
    id: item.id,
    serviceType: item.serviceType,
    status: item.status,
    province: item.province,
    serviceDateStart: item.serviceDateStart.toISOString(),
    serviceDateEnd: item.serviceDateEnd.toISOString(),
    supplierId: item.supplierId,
  };
}

function toDetailDto(row: DetailRow): ReservationDetailDto {
  return {
    ...toDto(row),
    travelerId: row.user.id,
    travelerEmail: row.user.email,
    travelerName: row.user.fullName,
    serviceItemCount: row.serviceItems.length,
    serviceItems: row.serviceItems.map(toServiceItemDto),
  };
}

function toAuditDto(row: AuditRow): AuditLogEntryDto {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    actorEmail: row.actor?.email ?? null,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
  ) {}

  /**
   * The operations pipeline: most recent first, optionally narrowed to a single
   * status. Each row carries the traveler and a service-item count so the board
   * can be read without a second request.
   */
  async list(query: ListReservationsQuery): Promise<ReservationListItemDto[]> {
    const reservations = await this.prisma.reservation.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: {
        user: { select: { email: true, fullName: true } },
        _count: { select: { serviceItems: true } },
      },
    });

    return reservations.map(toListDto);
  }

  /** One reservation with its traveler and service items, for the workbench. */
  async getById(id: string): Promise<ReservationDetailDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true } },
        serviceItems: { orderBy: { serviceDateStart: 'asc' } },
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }

    return toDetailDto(reservation);
  }

  /** The audit trail for a reservation, newest first. */
  async listAudit(id: string): Promise<AuditLogEntryDto[]> {
    const exists = await this.prisma.reservation.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }

    const entries = await this.prisma.auditLog.findMany({
      where: { entityType: 'Reservation', entityId: id },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { email: true } } },
    });

    return entries.map(toAuditDto);
  }

  /**
   * Create a booking for an existing traveler. This is the ops-side entry
   * point; the storefront's dynamic builder will submit the same shape and land
   * at ITINERARY_SUBMITTED. The booking code is generated and retried on the
   * rare collision.
   */
  async create(
    input: CreateReservationRequest,
    actor: AuthUser,
  ): Promise<ReservationDetailDto> {
    const traveler = await this.prisma.user.findUnique({
      where: { email: input.travelerEmail },
    });
    if (!traveler) {
      throw new NotFoundException(`No user with email ${input.travelerEmail}`);
    }
    if (input.endDate < input.startDate) {
      throw new BadRequestException('endDate must be on or after startDate');
    }

    let createdId: string | null = null;
    for (let attempt = 0; attempt < 5 && !createdId; attempt += 1) {
      const bookingCode = generateBookingCode();
      const clash = await this.prisma.reservation.findUnique({
        where: { bookingCode },
        select: { id: true },
      });
      if (clash) {
        continue;
      }

      createdId = await this.prisma.$transaction(async (tx) => {
        if (input.nationality) {
          await tx.user.update({
            where: { id: traveler.id },
            data: { nationality: input.nationality },
          });
        }

        const reservation = await tx.reservation.create({
          data: {
            userId: traveler.id,
            bookingCode,
            startDate: input.startDate,
            endDate: input.endDate,
            status: ReservationStatus.Draft,
            tourismCategory: input.tourismCategory,
            totalCurrency: input.totalCurrency,
            totalAmount: input.totalAmount,
            customItineraryPayload: input.customItineraryPayload as
              Prisma.InputJsonValue | undefined,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'reservation.created',
            entityType: 'Reservation',
            entityId: reservation.id,
            metadata: { bookingCode },
          },
        });

        return reservation.id;
      });
    }

    if (!createdId) {
      throw new ConflictException('Could not allocate a unique booking code');
    }

    return this.getById(createdId);
  }

  /**
   * Apply a status transition to a reservation and record it in the audit log.
   * The domain state machine owns what is legal; this only loads, checks,
   * persists, and reports.
   */
  async transition(
    id: string,
    input: TransitionReservationRequest,
    actor: AuthUser,
  ): Promise<ReservationDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }

    const from = reservation.status as ReservationStatus;
    assertTransition(from, input.to);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.reservation.update({
        where: { id },
        data: { status: input.to },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'reservation.transition',
          entityType: 'Reservation',
          entityId: id,
          metadata: { from, to: input.to, reason: input.reason ?? null },
        },
      });

      return result;
    });

    // Entering CONFIRMED issues the legal document set (spec §4.4). Generation
    // is best-effort: the transition is already persisted, and documents can be
    // regenerated via POST /reservations/:id/documents if this fails.
    if (input.to === ReservationStatus.Confirmed) {
      try {
        await this.documents.generate(id, actor);
      } catch (error) {
        this.logger.error(
          `Document generation failed for reservation ${id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return toDto(updated);
  }

  /**
   * Record or revise the statutory tourism classification of a booking
   * (spec §4.9.2). The regulatory reports read this; unclassified bookings are
   * GENERAL, so every booking stays reportable.
   */
  async classify(
    id: string,
    input: ClassifyReservationRequest,
    actor: AuthUser,
  ): Promise<ReservationDto> {
    const reservation = await this.prisma.reservation.findUnique({ where: { id } });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${id} not found`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.reservation.update({
        where: { id },
        data: { tourismCategory: input.tourismCategory },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'reservation.classified',
          entityType: 'Reservation',
          entityId: id,
          metadata: {
            from: reservation.tourismCategory,
            to: input.tourismCategory,
          },
        },
      });

      return result;
    });

    return toDto(updated);
  }
}
