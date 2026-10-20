import {
  GeneratorAccess,
  InventoryType,
  PrismaClient,
  ResourceChannel,
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

  // M6: a demo casa and driver with placeholder resources (dev data only), so
  // the register's Power column and the disruption console have rows. A re-seed
  // keeps whatever the desk confirmed since.
  const demoSuppliers = [
    {
      email: 'casa@example.test',
      fullName: 'Example Casa Host',
      category: SupplierCategory.HOMESTAY_HOST,
      phone: '+53 5555 0001',
      provinces: ['Pinar del Río'],
      rtn: 'RTN-DEMO-0002',
      resources: {
        generator: GeneratorAccess.OWN,
        generatorHoursPerDay: 6,
        generatorSchedule: '06–09, 18–21',
        generatorFuelDays: 2,
        waterTankLitres: 1000,
        rooms: 3,
        guestCapacity: 6,
      },
    },
    {
      email: 'driver@example.test',
      fullName: 'Example Driver',
      category: SupplierCategory.PRIVATE_DRIVER,
      phone: '+53 5555 0002',
      provinces: ['La Habana', 'Pinar del Río'],
      rtn: 'RTN-DEMO-0003',
      resources: { fuelReserveLitres: 40 },
    },
  ];
  for (const demo of demoSuppliers) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        email: demo.email,
        fullName: demo.fullName,
        role: Role.SERVICE_WORKER,
        locale: 'es',
        supplierProfile: {
          create: {
            category: demo.category,
            primaryPhone: demo.phone,
            provincesActive: demo.provinces,
            rtnLicenseNumber: demo.rtn,
            verificationStatus: VerificationStatus.VERIFIED,
            credentialExpiresAt: new Date('2027-12-31T00:00:00Z'),
          },
        },
      },
      include: { supplierProfile: true },
    });
    if (user.supplierProfile) {
      await prisma.supplierResources.upsert({
        where: { supplierId: user.supplierProfile.id },
        update: {},
        create: {
          supplierId: user.supplierProfile.id,
          ...demo.resources,
          confirmedAt: new Date(),
          confirmedById: superAdmin.id,
          confirmedVia: ResourceChannel.PHONE,
        },
      });
    }
  }

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
    // M4: the manifest's sample deposit plan and cancellation scale.
    update: {
      status: 'PUBLISHED',
      depositPolicy: 'standard',
      cancellationPolicy: 'standard',
    },
    create: {
      name: 'Trinidad Heritage Trail',
      slug: 'trinidad-heritage-trail',
      description:
        'A three-day colonial heritage and mountain immersion through Trinidad.',
      province: 'Sancti Spíritus',
      durationDays: 3,
      currency: 'EUR',
      basePrice: '240.00',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      bookingModel: 'REQUEST',
      leadTimeDays: 2,
      tourismCategory: 'CULTURAL',
      themes: ['colonial', 'mountains'],
      depositPolicy: 'standard',
      cancellationPolicy: 'standard',
      services: {
        create: [
          { inventoryItemId: stay.id, dayOffset: 0, position: 0 },
          { inventoryItemId: walk.id, dayOffset: 1, position: 0 },
          { inventoryItemId: stay.id, dayOffset: 2, position: 0 },
        ],
      },
    },
  });

  // M1 Package v2 sample content: two tiers, two departures, an extra and the
  // day texts, upserted so re-seeding is idempotent. The storefront draws these
  // once the Package page reads them.
  const tiers = [
    { code: 'standard', name: 'Standard', position: 0, priceDelta: '0', isDefault: true },
    {
      code: 'comfort',
      name: 'Comfort',
      position: 1,
      priceDelta: '120',
      isDefault: false,
    },
  ];
  for (const tier of tiers) {
    await prisma.packageTier.upsert({
      where: { packageId_code: { packageId: curatedPackage.id, code: tier.code } },
      update: { name: tier.name, priceDelta: tier.priceDelta, isDefault: tier.isDefault },
      create: { packageId: curatedPackage.id, ...tier },
    });
  }

  const departures = [
    { startDate: new Date('2027-02-13T00:00:00Z'), capacity: 8, price: '240' },
    { startDate: new Date('2027-03-06T00:00:00Z'), capacity: 8, price: '265' },
  ];
  for (const departure of departures) {
    await prisma.packageDeparture.upsert({
      where: {
        packageId_startDate: {
          packageId: curatedPackage.id,
          startDate: departure.startDate,
        },
      },
      update: { capacity: departure.capacity, price: departure.price },
      create: { packageId: curatedPackage.id, ...departure },
    });
  }

  await prisma.packageExtra.upsert({
    where: { packageId_code: { packageId: curatedPackage.id, code: 'horseback' } },
    update: {},
    create: {
      packageId: curatedPackage.id,
      code: 'horseback',
      name: 'Horseback ride in the valley',
      price: '35',
      priceUnit: 'PER_PERSON',
      dayOffset: 1,
      position: 0,
    },
  });

  const days = [
    {
      dayOffset: 0,
      title: 'Arrival in Trinidad',
      body: 'Check in at the colonial casa and walk the cobbled centre at dusk.',
      meals: 'Dinner',
    },
    {
      dayOffset: 1,
      title: 'Heritage walk & valley',
      body: 'Guided walk through the UNESCO old town, then the sugar-mill valley.',
      meals: 'Breakfast, lunch',
    },
    {
      dayOffset: 2,
      title: 'Mountains & departure',
      body: 'Morning in the Escambray foothills before the transfer out.',
      meals: 'Breakfast',
    },
  ];
  for (const day of days) {
    await prisma.packageDay.upsert({
      where: {
        packageId_dayOffset: {
          packageId: curatedPackage.id,
          dayOffset: day.dayOffset,
        },
      },
      update: { title: day.title, body: day.body, meals: day.meals },
      create: { packageId: curatedPackage.id, ...day },
    });
  }

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
