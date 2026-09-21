/**
 * Resets the E2E-owned fixtures so the suite is repeatable:
 * - the `E2E0001` reservation is put back to DRAFT;
 * - the seeded guide supplier is brought back to VERIFIED and available.
 *
 * It writes to the development database (the same one the stack uses). Run
 * `docker compose up -d` and `pnpm --filter @ota/db run seed` first.
 */
export default async function globalSetup(): Promise<void> {
  process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';

  const { PrismaClient } = await import('@ota/db');
  const prisma = new PrismaClient();

  try {
    const traveler = await prisma.user.findUnique({
      where: { email: 'traveler@example.test' },
    });
    const guide = await prisma.user.findUnique({
      where: { email: 'guide@example.test' },
      include: { supplierProfile: true },
    });

    if (!traveler || !guide?.supplierProfile) {
      throw new Error(
        'E2E fixtures are missing. Run `pnpm --filter @ota/db run seed` against the dev database first.',
      );
    }

    await prisma.reservation.upsert({
      where: { bookingCode: 'E2E0001' },
      update: { status: 'DRAFT' },
      create: {
        userId: traveler.id,
        bookingCode: 'E2E0001',
        startDate: new Date('2027-01-10T00:00:00Z'),
        endDate: new Date('2027-01-14T00:00:00Z'),
        status: 'DRAFT',
        totalCurrency: 'EUR',
        totalAmount: '321.00',
      },
    });

    await prisma.supplierProfile.update({
      where: { id: guide.supplierProfile.id },
      data: { verificationStatus: 'VERIFIED', isAvailable: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}
