import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@ota/db';
import { departurePlacesLeft } from '@ota/domain';

export interface SeatClaim {
  departureId: string;
  partySize: number;
  /** Refuse a departure that is not OPEN; a booking already on it may stay. */
  mustBeOpen: boolean;
  /** The booking being edited: its own seats are not taken from it. */
  reservationId?: string;
}

/**
 * Decide a departure's seats inside the transaction that writes them. The row
 * lock makes two bookings for the last seats take turns, so the second counts
 * the first; the status and capacity are read under it because a package save
 * may have changed them since the caller loaded the package.
 *
 * Call it before the reservation is written: the row's foreign key takes a
 * share lock on the departure, and two transactions upgrading theirs deadlock.
 * Locks go departures first, in `PackagesService.planCollections` too, because
 * a booking's foreign keys then need the tier and extras.
 */
export async function claimDepartureSeats(
  tx: Prisma.TransactionClient,
  claim: SeatClaim,
): Promise<void> {
  const [departure] = await tx.$queryRaw<{ capacity: number; status: string }[]>`
    SELECT capacity, status FROM package_departures
    WHERE id = ${claim.departureId}::uuid FOR UPDATE`;
  if (!departure || (claim.mustBeOpen && departure.status !== 'OPEN')) {
    throw new ConflictException('That departure is not open for booking');
  }

  const booked = await tx.reservation.aggregate({
    _sum: { partySize: true },
    where: {
      departureId: claim.departureId,
      status: { not: 'CANCELLED' },
      ...(claim.reservationId ? { id: { not: claim.reservationId } } : {}),
    },
  });
  if (
    claim.partySize > departurePlacesLeft(departure.capacity, booked._sum.partySize ?? 0)
  ) {
    throw new ConflictException('The departure does not have enough places left');
  }
}
