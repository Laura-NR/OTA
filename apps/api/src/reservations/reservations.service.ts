import { Injectable, NotFoundException } from '@nestjs/common';
import type { Reservation } from '@ota/db';
import { assertTransition, type ReservationStatus } from '@ota/domain';
import type { ReservationDto, TransitionReservationRequest } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
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
  constructor(private readonly prisma: PrismaService) {}

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

    return toDto(updated);
  }
}
