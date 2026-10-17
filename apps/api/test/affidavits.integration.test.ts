import { PrismaClient } from '@ota/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Prisma Client auto-loads packages/db/.env, so require an explicit opt-in.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

/**
 * Live proof of M3 decision D2 against Postgres: `traveler_affidavits` is
 * append-only (a trigger refuses any change), yet deleting the booking, the
 * traveler or a superseded affidavit still clears the link (ON DELETE SET
 * NULL) and keeps the record. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/affidavits.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)(
  'traveler_affidavits append-only trigger (live Postgres)',
  () => {
    let prisma: PrismaClient;
    let userId = '';
    const affidavitIds: string[] = [];
    const stamp = Date.now();

    const affidavitData = (overrides: Record<string, unknown> = {}) => ({
      category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE' as const,
      signerName: 'Luis Ortega',
      signerNationality: 'US',
      bookingCode: `AFF${stamp}`,
      travelStart: new Date('2027-02-13T00:00:00Z'),
      travelEnd: new Date('2027-02-20T00:00:00Z'),
      statementVersion: 'ofac-statement@test',
      statementHash: 'a'.repeat(64),
      signature: 'Luis Ortega',
      signedAt: new Date(),
      retainUntil: new Date('2032-02-20T00:00:00Z'),
      ...overrides,
    });

    beforeAll(async () => {
      prisma = new PrismaClient();
      const user = await prisma.user.create({
        data: { email: `affidavit-${stamp}@example.test`, role: 'TRAVELER' },
      });
      userId = user.id;
    });

    afterAll(async () => {
      if (!prisma) return;
      // DELETE stays allowed: it is how the retention sweep ends a record.
      await prisma.travelerAffidavit.deleteMany({ where: { id: { in: affidavitIds } } });
      await prisma.reservation.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.$disconnect();
    });

    async function booking(code: string) {
      const reservation = await prisma.reservation.create({
        data: {
          userId,
          bookingCode: code,
          startDate: new Date('2027-02-13T00:00:00Z'),
          endDate: new Date('2027-02-20T00:00:00Z'),
          totalAmount: '100.00',
        },
      });
      const traveler = await prisma.reservationTraveler.create({
        data: {
          reservationId: reservation.id,
          fullName: 'Luis Ortega',
          nationality: 'US',
        },
      });
      return { reservation, traveler };
    }

    it('refuses any change to a recorded affidavit', async () => {
      const { reservation, traveler } = await booking(`AFA${stamp}`);
      const affidavit = await prisma.travelerAffidavit.create({
        data: affidavitData({ reservationId: reservation.id, travelerId: traveler.id }),
      });
      affidavitIds.push(affidavit.id);

      await expect(
        prisma.travelerAffidavit.update({
          where: { id: affidavit.id },
          data: { signature: 'Someone Else' },
        }),
      ).rejects.toThrow(/append-only/);
      // Re-pointing a link to another row is a change too.
      const other = await booking(`AFB${stamp}`);
      await expect(
        prisma.travelerAffidavit.update({
          where: { id: affidavit.id },
          data: { reservationId: other.reservation.id },
        }),
      ).rejects.toThrow(/append-only/);

      const stored = await prisma.travelerAffidavit.findUniqueOrThrow({
        where: { id: affidavit.id },
      });
      expect(stored.signature).toBe('Luis Ortega');
      expect(stored.reservationId).toBe(reservation.id);
    });

    it('keeps the record when its traveler and then its booking are deleted', async () => {
      const { reservation, traveler } = await booking(`AFC${stamp}`);
      const affidavit = await prisma.travelerAffidavit.create({
        data: affidavitData({ reservationId: reservation.id, travelerId: traveler.id }),
      });
      affidavitIds.push(affidavit.id);

      await prisma.reservationTraveler.delete({ where: { id: traveler.id } });
      let stored = await prisma.travelerAffidavit.findUniqueOrThrow({
        where: { id: affidavit.id },
      });
      expect(stored.travelerId).toBeNull();
      expect(stored.reservationId).toBe(reservation.id);

      await prisma.reservation.delete({ where: { id: reservation.id } });
      stored = await prisma.travelerAffidavit.findUniqueOrThrow({
        where: { id: affidavit.id },
      });
      expect(stored.reservationId).toBeNull();
      expect(stored.signerName).toBe('Luis Ortega');
    });

    it('clears the superseded link when the older affidavit is swept', async () => {
      const older = await prisma.travelerAffidavit.create({ data: affidavitData() });
      const newer = await prisma.travelerAffidavit.create({
        data: affidavitData({ supersedesId: older.id, category: 'FAMILY_VISITS' }),
      });
      affidavitIds.push(newer.id);

      await prisma.travelerAffidavit.delete({ where: { id: older.id } });
      const stored = await prisma.travelerAffidavit.findUniqueOrThrow({
        where: { id: newer.id },
      });
      expect(stored.supersedesId).toBeNull();
      expect(stored.category).toBe('FAMILY_VISITS');
    });
  },
);
