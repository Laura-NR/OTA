import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Reservation } from '@ota/db';
import { ReservationStatus, assertTransition } from '@ota/domain';
import type {
  ListReservationsQuery,
  ReservationDto,
  TransitionReservationRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';

function toDto(reservation: Reservation): ReservationDto {
  return {
    id: reservation.id,
    bookingCode: reservation.bookingCode,
    status: reservation.status as ReservationStatus,
    startDate: reservation.startDate.toISOString(),
    endDate: reservation.endDate.toISOString(),
    totalCurrency: reservation.totalCurrency,
    totalAmount: reservation.totalAmount.toString(),
    createdAt: reservation.createdAt.toISOString(),
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
   * status. Serves the back-office board; the domain state machine is the only
   * source of legal statuses.
   */
  async list(query: ListReservationsQuery): Promise<ReservationDto[]> {
    const reservations = await this.prisma.reservation.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });

    return reservations.map(toDto);
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
}
