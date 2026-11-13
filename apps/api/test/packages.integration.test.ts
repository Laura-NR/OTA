import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import { InMemoryObjectStorage } from '@ota/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PackagesService } from '../src/packages/packages.service';
import { claimPackageChoices } from '../src/travelers/departure-seats';
import { fakeOperatingSettings } from './fixtures/operating-settings';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

// A valid 1x1 PNG.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Live proof of the M1 package write path against Postgres: creating a package
 * with tiers/departures/extras/days, replacing a collection, renaming the slug
 * (which leaves a redirect) and saving a locale overlay. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/packages.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('PackagesService (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: PackagesService;
  let actor: AuthUser;
  let itemId = '';
  let packageId = '';
  let bookedPackageId = '';
  const suffix = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new PackagesService(
      prisma as unknown as PrismaService,
      new InMemoryObjectStorage(),
      parseTenantConfig({
        tenantId: 'test-agency',
        branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
      }),
      fakeOperatingSettings(),
    );

    const user = await prisma.user.create({
      data: { email: `package-e2e-${suffix}@example.test`, role: 'SUPER_ADMIN' },
    });
    actor = { id: user.id, email: user.email, role: 'SUPER_ADMIN' } as AuthUser;

    const item = await prisma.inventoryItem.create({
      data: {
        type: 'ACCOMMODATION',
        name: `Integration Casa ${suffix}`,
        province: 'La Habana',
        basePrice: '90.00',
      },
    });
    itemId = item.id;
  });

  afterAll(async () => {
    if (packageId) {
      await prisma.package.deleteMany({ where: { id: packageId } });
    }
    await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
    await prisma.user.deleteMany({
      where: { email: `package-e2e-${suffix}@example.test` },
    });
    await prisma.$disconnect();
  });

  it('creates, replaces collections, redirects the slug and saves a locale', async () => {
    const created = await service.create(
      {
        name: `Integration Trail ${suffix}`,
        durationDays: 3,
        currency: 'EUR',
        basePrice: 200,
        status: 'PUBLISHED',
        bookingModel: 'REQUEST',
        leadTimeDays: 2,
        themes: ['colonial'],
        services: [{ inventoryItemId: itemId, dayOffset: 0, position: 0 }],
        tiers: [
          { code: 'standard', name: 'Standard', priceDelta: 0, isDefault: true },
          { code: 'comfort', name: 'Comfort', priceDelta: 120, isDefault: false },
        ],
        departures: [
          { startDate: new Date('2027-02-13T00:00:00Z'), capacity: 8 },
          { startDate: new Date('2027-03-06T00:00:00Z'), capacity: 8, price: 265 },
        ],
        extras: [
          {
            code: 'horseback',
            name: 'Horseback ride',
            price: 35,
            priceUnit: 'PER_PERSON',
          },
        ],
        days: [
          { dayOffset: 0, title: 'Arrival', body: 'Arrive and settle in.' },
          { dayOffset: 1, title: 'Valley day' },
        ],
      },
      actor,
    );
    packageId = created.id;

    expect(created.status).toBe('PUBLISHED');
    expect(created.tiers).toHaveLength(2);
    expect(created.departures).toHaveLength(2);
    expect(created.extras).toHaveLength(1);
    expect(created.days).toHaveLength(2);

    // Drop an unbooked tier and rename the slug.
    const renamed = await service.update(
      packageId,
      {
        slug: `integration-trail-renamed-${suffix}`,
        tiers: [{ code: 'standard', name: 'Standard', priceDelta: 0, isDefault: true }],
      },
      actor,
    );
    expect(renamed.slug).toBe(`integration-trail-renamed-${suffix}`);
    expect(renamed.tiers).toHaveLength(1);

    // The old slug still resolves through the redirect.
    const byOldSlug = await service.getBySlug(created.slug);
    expect(byOldSlug.id).toBe(packageId);

    // Save a Spanish overlay, including a nested day title.
    const translated = await service.upsertTranslation(
      packageId,
      'es',
      {
        name: 'Sendero de Integración',
        published: true,
        days: { '0': { title: 'Llegada' } },
      },
      actor,
    );
    const es = translated.translations.find((row) => row.locale === 'es');
    expect(es?.name).toBe('Sendero de Integración');
    expect(es?.published).toBe(true);

    // The public read overlays the published locale and strips the raw rows.
    const publicEs = (await service.listPublic({ locale: 'es' })).find(
      (row) => row.id === packageId,
    );
    expect(publicEs?.name).toBe('Sendero de Integración');
    expect(publicEs?.days.find((day) => day.dayOffset === 0)?.title).toBe('Llegada');
    expect(publicEs?.translations).toEqual([]);

    const publicEn = (await service.listPublic({ locale: 'en' })).find(
      (row) => row.id === packageId,
    );
    expect(publicEn?.name).toBe(`Integration Trail ${suffix}`);

    // Package media: upload, serve (public refuses drafts; this one is live), delete.
    const media = await service.uploadMedia(
      packageId,
      {
        contentType: 'image/png',
        contentBase64: PNG_1X1,
        altText: 'A colonial street',
        showsPeople: false,
      },
      actor,
    );
    expect(media.hasConsent).toBe(false);
    const withPeople = await service.uploadMedia(
      packageId,
      {
        contentType: 'image/png',
        contentBase64: PNG_1X1,
        altText: 'Musicians on the steps',
        showsPeople: true,
        consentReference: 'release-2026-017',
      },
      actor,
    );
    expect(withPeople).toMatchObject({ showsPeople: true, hasConsent: true });
    const listed = await service.getById(packageId);
    expect(JSON.stringify(listed.media)).not.toContain('release-2026-017');
    await service.deleteMedia(packageId, withPeople.id, actor);

    const served = await service.readMedia(media.id, true);
    expect(served.contentType).toBe('image/png');
    expect(served.data.length).toBeGreaterThan(0);
    await service.deleteMedia(packageId, media.id, actor);
  });

  describe('saving a package that has bookings', () => {
    let booked = { reservationId: '', departureId: '', tierId: '', extraId: '' };
    const saved = {
      tiers: [
        {
          code: 'standard',
          name: 'Standard',
          description: 'Casas in the old town',
          position: 0,
          priceDelta: 0,
          isDefault: true,
        },
      ],
      departures: [
        {
          startDate: new Date('2027-05-01T00:00:00Z'),
          capacity: 6,
          status: 'OPEN' as const,
        },
        {
          startDate: new Date('2027-06-05T00:00:00Z'),
          capacity: 6,
          status: 'CLOSED' as const,
        },
      ],
      extras: [
        {
          code: 'horseback',
          name: 'Horseback ride',
          price: 35,
          priceUnit: 'PER_PERSON' as const,
          position: 0,
          active: true,
        },
      ],
    };

    beforeAll(async () => {
      const pkg = await service.create(
        {
          name: `Booked Trail ${suffix}`,
          durationDays: 3,
          currency: 'EUR',
          basePrice: 200,
          status: 'DRAFT',
          bookingModel: 'REQUEST',
          leadTimeDays: 2,
          themes: [],
          services: [{ inventoryItemId: itemId, dayOffset: 0, position: 0 }],
          ...saved,
        },
        actor,
      );
      bookedPackageId = pkg.id;
      const departure = pkg.departures[0]!;
      const tier = pkg.tiers[0]!;
      const extra = pkg.extras[0]!;
      const reservation = await prisma.reservation.create({
        data: {
          userId: actor.id,
          bookingCode: `PK${String(suffix).slice(-6)}`,
          packageId: pkg.id,
          status: 'ITINERARY_SUBMITTED',
          startDate: new Date('2027-05-01T00:00:00Z'),
          endDate: new Date('2027-05-03T00:00:00Z'),
          totalCurrency: 'EUR',
          totalAmount: '800.00',
          partySize: 4,
          departureId: departure.id,
          tierId: tier.id,
          extras: {
            create: {
              packageExtraId: extra.id,
              label: extra.name,
              unitAmount: '35.00',
              amount: '140.00',
            },
          },
        },
      });
      booked = {
        reservationId: reservation.id,
        departureId: departure.id,
        tierId: tier.id,
        extraId: extra.id,
      };
    });

    afterAll(async () => {
      await prisma.reservation.deleteMany({ where: { id: booked.reservationId } });
      await prisma.package.deleteMany({ where: { id: bookedPackageId } });
    });

    const links = async () => {
      const row = await prisma.reservation.findUniqueOrThrow({
        where: { id: booked.reservationId },
        select: {
          departureId: true,
          tierId: true,
          extras: { select: { packageExtraId: true } },
        },
      });
      return {
        departureId: row.departureId,
        tierId: row.tierId,
        extraId: row.extras[0]?.packageExtraId,
      };
    };
    const expectedLinks = () => ({
      departureId: booked.departureId,
      tierId: booked.tierId,
      extraId: booked.extraId,
    });

    it('keeps a booking on its departure, tier and extra, and its seats counted', async () => {
      const updated = await service.update(bookedPackageId, saved, actor);

      expect(await links()).toEqual(expectedLinks());
      expect(updated.departures.map((departure) => departure.id)).toContain(
        booked.departureId,
      );
      const seats = await prisma.reservation.aggregate({
        _sum: { partySize: true },
        where: { departureId: booked.departureId, status: { not: 'CANCELLED' } },
      });
      expect(seats._sum.partySize).toBe(4);
    });

    it('updates a kept row in place, adds a new one and removes an unused one', async () => {
      const updated = await service.update(
        bookedPackageId,
        {
          departures: [
            { ...saved.departures[0]!, capacity: 9 },
            { startDate: new Date('2027-07-03T00:00:00Z'), capacity: 6, status: 'OPEN' },
          ],
        },
        actor,
      );

      expect(updated.departures.map((row) => row.startDate.slice(0, 10))).toEqual([
        '2027-05-01',
        '2027-07-03',
      ]);
      expect(updated.departures[0]).toMatchObject({
        id: booked.departureId,
        capacity: 9,
      });
      expect(await links()).toEqual(expectedLinks());
    });

    it('refuses to remove a booked departure, tier or extra, changing nothing', async () => {
      const refused = service.update(
        bookedPackageId,
        {
          name: 'Must not be saved',
          tiers: [{ ...saved.tiers[0]!, code: 'comfort' }],
          departures: [
            { startDate: new Date('2027-08-07T00:00:00Z'), capacity: 6, status: 'OPEN' },
          ],
          extras: [],
        },
        actor,
      );

      await expect(refused).rejects.toMatchObject({
        status: 409,
        response: {
          error: 'PackageRowsInUse',
          refusals: expect.arrayContaining([
            expect.objectContaining({ kind: 'DEPARTURE_BOOKED', row: '2027-05-01' }),
            expect.objectContaining({ kind: 'TIER_BOOKED', row: 'standard' }),
            expect.objectContaining({ kind: 'EXTRA_BOOKED', row: 'horseback' }),
          ]),
        },
      });
      expect(await links()).toEqual(expectedLinks());
      const after = await service.getById(bookedPackageId);
      expect(after.name).toBe(`Booked Trail ${suffix}`);
    });

    it('refuses a capacity below the seats already booked', async () => {
      await expect(
        service.update(
          bookedPackageId,
          { departures: [{ ...saved.departures[0]!, capacity: 3 }] },
          actor,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          refusals: [
            expect.objectContaining({
              kind: 'DEPARTURE_BELOW_BOOKED',
              row: '2027-05-01',
              capacity: 3,
              booked: 4,
            }),
          ],
        },
      });
    });

    it('lets a departure go once its only booking is cancelled', async () => {
      await prisma.reservation.update({
        where: { id: booked.reservationId },
        data: { status: 'CANCELLED' },
      });

      const updated = await service.update(
        bookedPackageId,
        {
          departures: [
            { startDate: new Date('2027-09-04T00:00:00Z'), capacity: 6, status: 'OPEN' },
          ],
        },
        actor,
      );

      expect(updated.departures.map((row) => row.id)).not.toContain(booked.departureId);
    });

    it('waits for a booking still being written, then refuses to take its departure', async () => {
      const pkg = await service.getById(bookedPackageId);
      const departure = pkg.departures[0]!;
      let written = () => {};
      let release = () => {};
      const bookingWritten = new Promise<void>((resolve) => (written = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));

      const booking = prisma.$transaction(async (tx) => {
        const reservation = await tx.reservation.create({
          data: {
            userId: actor.id,
            bookingCode: `PR${String(suffix).slice(-6)}`,
            packageId: bookedPackageId,
            status: 'ITINERARY_SUBMITTED',
            startDate: new Date('2027-09-04T00:00:00Z'),
            endDate: new Date('2027-09-06T00:00:00Z'),
            totalCurrency: 'EUR',
            totalAmount: '200.00',
            departureId: departure.id,
          },
        });
        written();
        await released;
        return reservation;
      });
      await bookingWritten;

      const save = service
        .update(
          bookedPackageId,
          {
            departures: [
              {
                startDate: new Date('2027-10-02T00:00:00Z'),
                capacity: 6,
                status: 'OPEN',
              },
            ],
          },
          actor,
        )
        .catch((error: unknown) => error);
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      const reservation = await booking;

      expect(await save).toMatchObject({
        status: 409,
        response: { refusals: [expect.objectContaining({ kind: 'DEPARTURE_BOOKED' })] },
      });
      const stored = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservation.id },
      });
      expect(stored.departureId).toBe(departure.id);
      await prisma.reservation.delete({ where: { id: reservation.id } });
    });

    it('saves past a booking that holds a departure and still needs its tier', async () => {
      const pkg = await service.update(bookedPackageId, saved, actor);
      const departure = pkg.departures[0]!;
      const tier = pkg.tiers[0]!;
      let locked = () => {};
      let release = () => {};
      const departureLocked = new Promise<void>((resolve) => (locked = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));

      // A booking locks its departure first; inserting it then checks the tier.
      const booking = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM package_departures WHERE id = ${departure.id}::uuid FOR UPDATE`;
        locked();
        await released;
        return tx.reservation.create({
          data: {
            userId: actor.id,
            bookingCode: `PL${String(suffix).slice(-6)}`,
            packageId: bookedPackageId,
            status: 'ITINERARY_SUBMITTED',
            startDate: new Date('2027-05-01T00:00:00Z'),
            endDate: new Date('2027-05-03T00:00:00Z'),
            totalCurrency: 'EUR',
            totalAmount: '200.00',
            partySize: 1,
            departureId: departure.id,
            tierId: tier.id,
          },
        });
      });
      await departureLocked;

      const save = service.update(bookedPackageId, saved, actor);
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      const [written, updated] = await Promise.allSettled([booking, save]);

      if (written.status === 'fulfilled') {
        await prisma.reservation.delete({ where: { id: written.value.id } });
      }
      expect([written.status, updated.status]).toEqual(['fulfilled', 'fulfilled']);
    });

    it('waits for a booking holding a tier and extras, then refuses to remove them', async () => {
      const pkg = await service.update(
        bookedPackageId,
        {
          ...saved,
          tiers: [
            ...saved.tiers,
            { ...saved.tiers[0]!, code: 'garden', name: 'Garden', isDefault: false },
          ],
          extras: [
            ...saved.extras,
            { ...saved.extras[0]!, code: 'salsa', name: 'Salsa class', position: 1 },
            { ...saved.extras[0]!, code: 'cigar', name: 'Cigar farm', position: 2 },
          ],
        },
        actor,
      );
      const tier = pkg.tiers.find((row) => row.code === 'garden')!;
      const extras = pkg.extras.filter((row) => row.code !== 'horseback');
      let claimed = () => {};
      let release = () => {};
      const choicesClaimed = new Promise<void>((resolve) => (claimed = resolve));
      const released = new Promise<void>((resolve) => (release = resolve));

      const booking = prisma.$transaction(async (tx) => {
        await claimPackageChoices(tx, {
          tierId: tier.id,
          packageExtraIds: extras.map((extra) => extra.id),
        });
        claimed();
        await released;
        return tx.reservation.create({
          data: {
            userId: actor.id,
            bookingCode: `PC${String(suffix).slice(-6)}`,
            packageId: bookedPackageId,
            status: 'ITINERARY_SUBMITTED',
            startDate: new Date('2027-05-01T00:00:00Z'),
            endDate: new Date('2027-05-03T00:00:00Z'),
            totalCurrency: 'EUR',
            totalAmount: '200.00',
            partySize: 1,
            tierId: tier.id,
            extras: {
              create: extras.map((extra) => ({
                packageExtraId: extra.id,
                label: extra.name,
                unitAmount: '35.00',
                amount: '35.00',
              })),
            },
          },
        });
      });
      await choicesClaimed;

      const save = service.update(bookedPackageId, saved, actor).catch((error) => error);
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      const reservation = await booking;

      expect(await save).toMatchObject({
        status: 409,
        response: {
          refusals: expect.arrayContaining([
            expect.objectContaining({ kind: 'TIER_BOOKED', row: 'garden' }),
            expect.objectContaining({ kind: 'EXTRA_BOOKED', row: 'salsa' }),
            expect.objectContaining({ kind: 'EXTRA_BOOKED', row: 'cigar' }),
          ]),
        },
      });
      await prisma.reservation.delete({ where: { id: reservation.id } });
    });
  });
});
