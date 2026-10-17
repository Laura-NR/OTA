import { ofacGate, type OfacGate } from '@ota/domain';

import type { PrismaService } from '../prisma/prisma.service';

/**
 * The booking's OFAC gate (M3, D3): which US persons still have no affidavit.
 * A plain function over Prisma, so payments, documents and the affidavit
 * routes share one rule without a module cycle.
 */
export async function loadOfacGate(
  prisma: PrismaService,
  reservationId: string,
): Promise<OfacGate> {
  const travelers = await prisma.reservationTraveler.findMany({
    where: { reservationId },
    select: { id: true, usPerson: true, nationality: true },
  });
  if (travelers.length === 0) {
    return { required: [], missing: [] };
  }
  const affidavits = await prisma.travelerAffidavit.findMany({
    where: { travelerId: { in: travelers.map((traveler) => traveler.id) } },
    select: { travelerId: true },
  });
  return ofacGate(travelers, affidavits);
}
