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

  // M9: a second Super Admin, so a thresholds change or a Super Admin
  // invitation can be confirmed in dev (dev data only).
  await prisma.user.upsert({
    where: { email: 'founder@example.test' },
    update: {},
    create: {
      email: 'founder@example.test',
      fullName: 'Example Founder',
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

  const events = await seedEvents();

  console.log(
    `Seeded ${superAdmin.email}, ${worker.email}, reservation ${reservation.bookingCode} (${reservation.id}), package ${curatedPackage.slug} and events ${events.join(', ')}`,
  );
}

/** A UTC calendar day, the form event dates are stored in. */
function calendarDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/**
 * M10 sample events from the Concierge board (placeholder data): the Havana
 * Jazz Festival with its seven nights and three seat categories, and a free,
 * guide-only festival. Upserted by slug; nights and categories are created
 * once, so a re-seed never breaks a request that points at them.
 */
async function seedEvents(): Promise<string[]> {
  const jazz = await prisma.event.upsert({
    where: { slug: 'havana-jazz-festival-2027' },
    create: {
      slug: 'havana-jazz-festival-2027',
      status: 'PUBLISHED',
      access: 'ALLOCATIONS_OPEN',
      province: 'CU03',
      startsOn: calendarDay('2027-01-18'),
      endsOn: calendarDay('2027-01-24'),
      datesConfirmed: true,
      confirmBy: calendarDay('2027-01-08'),
      sourceLocale: 'en',
      name: 'Havana Jazz Festival',
      place: 'Havana · Vedado & Old Havana',
      summary:
        'Seven nights of concerts across Vedado and Old Havana. Tickets for the main venues are allocated late and sell through channels you cannot reach from abroad; our concierge requests them through licensed sellers.',
      notes: 'Programme and venues are published by the organiser in December.',
      publishedAt: new Date(),
    },
    update: {},
  });
  const nights = [
    ['2027-01-18', 'Opening gala', 'Teatro Nacional'],
    ['2027-01-19', 'Late set', 'Fábrica de Arte Cubano'],
    ['2027-01-20', 'Jazz Café', 'Jazz Café, Vedado'],
    ['2027-01-21', 'Casa de la Cultura', 'Casa de la Cultura de Plaza'],
    ['2027-01-22', 'Teatro Mella', 'Teatro Mella'],
    ['2027-01-23', 'Headline night', 'Teatro Nacional'],
    ['2027-01-24', 'Closing', 'Old Havana open-air stage'],
  ] as const;
  if ((await prisma.eventNight.count({ where: { eventId: jazz.id } })) === 0) {
    await prisma.eventNight.createMany({
      data: nights.map(([date, label, venue], position) => ({
        eventId: jazz.id,
        date: calendarDay(date),
        label,
        venue,
        position,
      })),
    });
  }
  if ((await prisma.eventSeatCategory.count({ where: { eventId: jazz.id } })) === 0) {
    await prisma.eventSeatCategory.createMany({
      data: [
        {
          eventId: jazz.id,
          kind: 'GENERAL',
          name: 'General admission',
          description: 'Standing or unreserved; first come at the venue.',
          pricePerSeat: 25,
          position: 0,
        },
        {
          eventId: jazz.id,
          kind: 'NUMBERED',
          name: 'Numbered seat',
          description: 'Reserved seat in the main hall; best for galas.',
          pricePerSeat: 45,
          position: 1,
        },
        {
          eventId: jazz.id,
          kind: 'PASS',
          name: 'All-festival pass',
          description: 'Every night, every main venue; limited allocation.',
          pricePerSeat: null,
          position: 2,
        },
      ],
    });
  }
  for (const [locale, name, summary] of [
    [
      'es',
      'Festival Internacional Jazz Plaza',
      'Siete noches de conciertos entre el Vedado y La Habana Vieja. Las entradas de las salas principales se asignan tarde y se venden por canales que no se alcanzan desde el extranjero; nuestra conserjería las pide a vendedores autorizados.',
    ],
    [
      'fr',
      'Festival de jazz de La Havane',
      'Sept soirées de concerts entre le Vedado et la Vieille Havane. Les billets des grandes salles sont attribués tard et vendus par des canaux inaccessibles depuis l’étranger ; notre conciergerie les demande auprès de vendeurs agréés.',
    ],
  ] as const) {
    await prisma.eventTranslation.upsert({
      where: { eventId_locale: { eventId: jazz.id, locale } },
      create: {
        eventId: jazz.id,
        locale,
        name,
        summary,
        published: true,
        sourceUpdatedAt: jazz.updatedAt,
      },
      update: {},
    });
  }

  const romerias = await prisma.event.upsert({
    where: { slug: 'romerias-de-mayo-2027' },
    create: {
      slug: 'romerias-de-mayo-2027',
      status: 'PUBLISHED',
      access: 'GUIDE_ONLY',
      province: 'CU11',
      startsOn: calendarDay('2027-05-01'),
      endsOn: calendarDay('2027-05-31'),
      datesConfirmed: false,
      sourceLocale: 'en',
      name: 'Romerías de Mayo',
      place: 'Holguín',
      summary:
        'A week of street processions, drums and youth arts in Holguín. The events are free; we add a guide who knows the programme to your trip.',
      publishedAt: new Date(),
    },
    update: {},
  });
  return [jazz.slug, romerias.slug];
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
