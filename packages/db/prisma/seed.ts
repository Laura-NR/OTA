import {
  InventoryType,
  PrismaClient,
  Role,
  SupplierCategory,
  VerificationStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function ensureInventoryItem(
  name: string,
  data: {
    type: InventoryType;
    province: string;
    basePrice: string;
    description: string;
  },
) {
  const existing = await prisma.inventoryItem.findFirst({ where: { name } });
  if (existing) {
    return existing;
  }
  return prisma.inventoryItem.create({ data: { name, ...data } });
}

async function main(): Promise<void> {
  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@example.test' },
    update: {},
    create: {
      email: 'admin@example.test',
      fullName: 'Platform Super Admin',
      role: Role.SUPER_ADMIN,
      locale: 'es',
    },
  });

  const traveler = await prisma.user.upsert({
    where: { email: 'traveler@example.test' },
    update: { nationality: 'ES' },
    create: {
      email: 'traveler@example.test',
      fullName: 'Example Traveler',
      role: Role.TRAVELER,
      locale: 'en',
      nationality: 'ES',
    },
  });

  const worker = await prisma.user.upsert({
    where: { email: 'guide@example.test' },
    update: {},
    create: {
      email: 'guide@example.test',
      fullName: 'Example Guide',
      role: Role.SERVICE_WORKER,
      locale: 'es',
      supplierProfile: {
        create: {
          category: SupplierCategory.TOUR_GUIDE,
          primaryPhone: '+53 5555 0000',
          provincesActive: ['Pinar del Río', 'La Habana'],
          rtnLicenseNumber: 'RTN-DEMO-0001',
          verificationStatus: VerificationStatus.VERIFIED,
          credentialExpiresAt: new Date('2027-12-31T00:00:00Z'),
        },
      },
    },
  });

  const reservation = await prisma.reservation.upsert({
    where: { bookingCode: 'DEMO0001' },
    update: { tourismCategory: 'ECOTOURISM' },
    create: {
      userId: traveler.id,
      bookingCode: 'DEMO0001',
      startDate: new Date('2026-11-01T00:00:00Z'),
      endDate: new Date('2026-11-05T00:00:00Z'),
      status: 'DRAFT',
      tourismCategory: 'ECOTOURISM',
      totalCurrency: 'EUR',
      totalAmount: '250.00',
    },
  });

  const existingItem = await prisma.serviceItem.findFirst({
    where: { reservationId: reservation.id },
  });
  if (!existingItem) {
    await prisma.serviceItem.create({
      data: {
        reservationId: reservation.id,
        serviceType: 'GUIDE',
        serviceDateStart: new Date('2026-11-02T09:00:00Z'),
        serviceDateEnd: new Date('2026-11-02T13:00:00Z'),
        province: 'La Habana',
        status: 'UNASSIGNED',
      },
    });
  }

  // A curated package (spec §3.3) built from two catalog items so the
  // storefront package pages and the booking path have demo data.
  const stay = await ensureInventoryItem('Casa Colonial Trinidad', {
    type: InventoryType.ACCOMMODATION,
    province: 'Sancti Spíritus',
    basePrice: '90.00',
    description: 'Restored colonial guesthouse in the historic centre.',
  });
  const walk = await ensureInventoryItem('Trinidad Heritage Walk', {
    type: InventoryType.EXPERIENCE,
    province: 'Sancti Spíritus',
    basePrice: '45.00',
    description: 'Guided walking tour of the UNESCO-listed old town.',
  });

  const curatedPackage = await prisma.package.upsert({
    where: { slug: 'trinidad-heritage-trail' },
    update: {},
    create: {
      name: 'Trinidad Heritage Trail',
      slug: 'trinidad-heritage-trail',
      description:
        'A three-day colonial heritage and mountain immersion through Trinidad.',
      province: 'Sancti Spíritus',
      durationDays: 3,
      currency: 'EUR',
      basePrice: '240.00',
      active: true,
      services: {
        create: [
          { inventoryItemId: stay.id, dayOffset: 0, position: 0 },
          { inventoryItemId: walk.id, dayOffset: 1, position: 0 },
          { inventoryItemId: stay.id, dayOffset: 2, position: 0 },
        ],
      },
    },
  });

  console.log(
    `Seeded ${superAdmin.email}, ${worker.email}, reservation ${reservation.bookingCode} (${reservation.id}), and package ${curatedPackage.slug}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
