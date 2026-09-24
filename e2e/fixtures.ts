import type { PrismaClient } from '@ota/db';

const START = new Date('2027-05-01T00:00:00Z');
const END = new Date('2027-05-05T00:00:00Z');

/**
 * A booking in ITINERARY_SUBMITTED with one UNASSIGNED guide item in La Habana,
 * ready to dispatch. Upserted so a re-run starts clean; pair with
 * `deleteReservationFixture` in afterEach. The caller owns the Prisma client.
 */
export async function createDispatchableReservation(
  prisma: PrismaClient,
  bookingCode: string,
) {
  const traveler = await prisma.user.findUnique({
    where: { email: 'traveler@example.test' },
  });
  if (!traveler) {
    throw new Error(
      'E2E fixtures are missing. Run `pnpm --filter @ota/db run seed` first.',
    );
  }

  const reservation = await prisma.reservation.upsert({
    where: { bookingCode },
    update: { status: 'ITINERARY_SUBMITTED', completedAt: null },
    create: {
      userId: traveler.id,
      bookingCode,
      startDate: START,
      endDate: END,
      status: 'ITINERARY_SUBMITTED',
      totalCurrency: 'EUR',
      totalAmount: '120.00',
    },
  });

  const existing = await prisma.serviceItem.findFirst({
    where: { reservationId: reservation.id },
  });
  const serviceItem = existing
    ? await prisma.serviceItem.update({
        where: { id: existing.id },
        data: {
          status: 'UNASSIGNED',
          supplierId: null,
          offeredAt: null,
          dispatchDeadline: null,
          respondedAt: null,
          declineReason: null,
        },
      })
    : await prisma.serviceItem.create({
        data: {
          reservationId: reservation.id,
          serviceType: 'GUIDE',
          serviceDateStart: START,
          serviceDateEnd: END,
          province: 'La Habana',
          status: 'UNASSIGNED',
        },
      });

  return { reservation, serviceItem };
}

/** Remove a fixture booking and its audit trail (offers/items cascade). */
export async function deleteReservationFixture(
  prisma: PrismaClient,
  bookingCode: string,
): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { bookingCode },
    select: { id: true, serviceItems: { select: { id: true } } },
  });
  if (!reservation) {
    return;
  }
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityType: 'Reservation', entityId: reservation.id },
        {
          entityType: 'ServiceItem',
          entityId: { in: reservation.serviceItems.map((item) => item.id) },
        },
      ],
    },
  });
  await prisma.reservation.delete({ where: { id: reservation.id } });
}
