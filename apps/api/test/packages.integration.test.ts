import { PrismaClient } from '@ota/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PackagesService } from '../src/packages/packages.service';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is present; require
// an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

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
  const suffix = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new PackagesService(prisma as unknown as PrismaService);

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

    // Replace the tiers wholesale and rename the slug.
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
  });
});
