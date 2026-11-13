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
 * a booking's foreign keys then need the tier and extras (`claimPackageChoices`).
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

export interface PackageChoiceClaim {
  tierId: string | null;
  packageExtraIds: string[];
}

/**
 * Hold the booking's tier and extras inside the transaction that writes it, after
 * its departure. A package save locks these rows before it removes or withdraws
 * one, so it either waits for the booking (and then sees it, and refuses) or has
 * already committed, which this re-read catches as a 409 instead of a foreign-key
 * failure or a withdrawn extra sold. Extras lock in id order, as the save takes
 * them, so a booking with two extras cannot deadlock against a save.
 */
export async function claimPackageChoices(
  tx: Prisma.TransactionClient,
  claim: PackageChoiceClaim,
): Promise<void> {
  if (claim.tierId) {
    const [tier] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM package_tiers WHERE id = ${claim.tierId}::uuid FOR SHARE`;
    if (!tier) {
      throw new ConflictException('That tier is no longer offered on this package');
    }
  }

  if (claim.packageExtraIds.length > 0) {
    const extras = await tx.$queryRaw<{ id: string; active: boolean }[]>`
      SELECT id, active FROM package_extras
      WHERE id = ANY(${claim.packageExtraIds}::uuid[]) ORDER BY id FOR SHARE`;
    const offered = new Set(
      extras.filter((extra) => extra.active).map((extra) => extra.id),
    );
    if (claim.packageExtraIds.some((id) => !offered.has(id))) {
      throw new ConflictException('An extra is no longer offered on this package');
    }
  }
}
