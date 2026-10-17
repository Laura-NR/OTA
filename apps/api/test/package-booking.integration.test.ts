import { randomBytes } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import { decryptPassportNumber } from '@ota/domain/passport-cipher';
import { bookPackageSchema, type LegalContent } from '@ota/schemas';
import { InMemoryObjectStorage } from '@ota/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { AffidavitsService } from '../src/compliance/affidavits.service';
import { ConsentsService } from '../src/compliance/consents.service';
import { LegalTextsService } from '../src/compliance/legal-texts.service';
import { MeService } from '../src/me/me.service';
import { PackageBookingService } from '../src/me/package-booking.service';
import type { PaymentsService } from '../src/payments/payments.service';
import type { PrismaService } from '../src/prisma/prisma.service';

// Prisma Client auto-loads packages/db/.env, so require an explicit opt-in.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const legal: Record<string, LegalContent> = {
  en: {
    status: 'placeholder',
    ofacStatement: { version: 'ofac@it', text: 'I certify my travel category.' },
    consents: {
      TERMS: { version: 'terms@it', text: 'Terms.' },
      PRIVACY_NOTICE: { version: 'terms@it', text: 'Terms.' },
      CANCELLATION_POLICY: { version: 'terms@it', text: 'Terms.' },
      INSURANCE_ACKNOWLEDGEMENT: { version: 'insurance@it', text: 'Insurance.' },
    },
  },
};

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
  pricing: {
    childBands: [
      { maxAge: 1, rate: 0 },
      { maxAge: 12, rate: 0.6 },
    ],
    fees: [{ label: 'Service fee', unit: 'PER_BOOKING', amount: 100 }],
  },
});

/**
 * Live proof of the Booking form's write against Postgres: one transaction
 * stores the booking, its rooms, travelers (passport as ciphertext), extras,
 * frozen price lines, the US certification and the consents, with every
 * foreign key real; a refused booking writes nothing. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/package-booking.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('Booking form write (live Postgres)', () => {
  let prisma: PrismaClient;
  let me: MeService;
  let actor: AuthUser;
  let itemId = '';
  let packageId = '';
  let departureId = '';
  let tierId = '';
  let extraId = '';
  const key = randomBytes(32);
  const stamp = Date.now();

  beforeAll(async () => {
    prisma = new PrismaClient();
    const db = prisma as unknown as PrismaService;
    const texts = new LegalTextsService(legal);
    const affidavits = new AffidavitsService(db, texts, new InMemoryObjectStorage());
    const consents = new ConsentsService(db, texts);
    me = new MeService(
      db,
      {} as PaymentsService,
      new PackageBookingService(db, affidavits, consents, tenant, key),
    );

    const user = await prisma.user.create({
      data: { email: `booking-it-${stamp}@example.test`, role: 'TRAVELER' },
    });
    actor = { id: user.id, email: user.email, role: 'TRAVELER' } as AuthUser;

    const item = await prisma.inventoryItem.create({
      data: {
        type: 'ACCOMMODATION',
        name: `Booking IT Casa ${stamp}`,
        province: 'Pinar del Río',
        basePrice: '90.00',
      },
    });
    itemId = item.id;

    const pkg = await prisma.package.create({
      data: {
        name: `Booking IT Trail ${stamp}`,
        slug: `booking-it-trail-${stamp}`,
        durationDays: 8,
        basePrice: '1000.00',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        services: { create: [{ inventoryItemId: itemId, dayOffset: 1, position: 0 }] },
        tiers: {
          create: [
            {
              code: 'comfort',
              name: 'Comfort',
              priceDelta: '120.00',
              singleSupplement: '380.00',
              isDefault: true,
            },
          ],
        },
        departures: {
          create: [{ startDate: new Date('2027-02-13T00:00:00Z'), capacity: 4 }],
        },
        extras: {
          create: [
            {
              code: 'horse',
              name: 'Horseback ride',
              price: '35.00',
              priceUnit: 'PER_PERSON',
            },
          ],
        },
      },
      include: { tiers: true, departures: true, extras: true },
    });
    packageId = pkg.id;
    tierId = pkg.tiers[0]!.id;
    departureId = pkg.departures[0]!.id;
    extraId = pkg.extras[0]!.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const reservations = await prisma.reservation.findMany({
      where: { userId: actor?.id },
      select: { id: true },
    });
    const ids = reservations.map((row) => row.id);
    // Affidavits refuse UPDATE but allow DELETE (the retention sweep's path).
    await prisma.travelerAffidavit.deleteMany({ where: { reservationId: { in: ids } } });
    await prisma.consentRecord.deleteMany({ where: { userId: actor?.id } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: actor?.id } });
    await prisma.reservation.deleteMany({ where: { id: { in: ids } } });
    await prisma.package.deleteMany({ where: { id: packageId } });
    await prisma.inventoryItem.deleteMany({ where: { id: itemId } });
    await prisma.user.deleteMany({ where: { id: actor?.id } });
    await prisma.$disconnect();
  });

  const request = (overrides: Record<string, unknown> = {}) =>
    bookPackageSchema.parse({
      packageId,
      departureId,
      tierId,
      rooming: 'SHARE',
      travelers: [
        {
          fullName: 'Margaret Anne Chen',
          dateOfBirth: '1980-04-02',
          nationality: 'US',
          passportNumber: 'AB1234567',
        },
        { fullName: 'Emma Chen', dateOfBirth: '2018-06-01', nationality: 'CA' },
      ],
      extras: [{ packageExtraId: extraId }],
      affidavits: [
        {
          traveler: 0,
          category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE',
          signature: 'Margaret Anne Chen',
        },
      ],
      statementVersion: 'ofac@it',
      consents: [
        { purpose: 'TERMS', textVersion: 'terms@it' },
        { purpose: 'PRIVACY_NOTICE', textVersion: 'terms@it' },
        { purpose: 'CANCELLATION_POLICY', textVersion: 'terms@it' },
        { purpose: 'INSURANCE_ACKNOWLEDGEMENT', textVersion: 'insurance@it' },
      ],
      locale: 'en',
      ...overrides,
    });
  const client = { ipAddress: '203.0.113.7', userAgent: 'BookingIT/1.0' };

  it('stores the booking and every record in one transaction', async () => {
    const booked = await me.bookPackage(actor, request(), client);

    const row = await prisma.reservation.findUniqueOrThrow({
      where: { id: booked.id },
      include: {
        rooms: true,
        travelers: { orderBy: { position: 'asc' } },
        extras: true,
        priceLines: { orderBy: { position: 'asc' } },
        affidavits: true,
        consents: true,
        serviceItems: true,
      },
    });

    // 1000 + 120 adult, 60 % of 1120 for the child, 2 × 35 horseback, 100 fee.
    expect(row.totalAmount.toString()).toBe('1962');
    expect(
      row.priceLines.reduce((sum, line) => sum + Number(line.amount), 0),
    ).toBeCloseTo(1962, 2);
    expect(row).toMatchObject({ partySize: 2, tierId, departureId, packageId });
    expect(row.rooms).toEqual([expect.objectContaining({ capacity: 2 })]);
    expect(row.travelers.map((traveler) => traveler.kind)).toEqual(['ADULT', 'CHILD']);
    expect(row.travelers.every((traveler) => traveler.roomId === row.rooms[0]!.id)).toBe(
      true,
    );
    expect(row.extras).toEqual([
      expect.objectContaining({ packageExtraId: extraId, quantity: 1 }),
    ]);
    expect(row.extras[0]!.amount.toString()).toBe('70');
    expect(row.serviceItems).toHaveLength(1);

    const lead = row.travelers[0]!;
    expect(lead.passportNumberEnc).not.toContain('AB1234567');
    expect(decryptPassportNumber(lead.passportNumberEnc!, key, lead.id)).toBe(
      'AB1234567',
    );

    expect(row.affidavits).toEqual([
      expect.objectContaining({
        travelerId: lead.id,
        source: 'ONLINE',
        ipAddress: '203.0.113.7',
        statementVersion: 'ofac@it',
      }),
    ]);
    expect(row.consents.map((consent) => consent.purpose).sort()).toEqual([
      'CANCELLATION_POLICY',
      'INSURANCE_ACKNOWLEDGEMENT',
      'PRIVACY_NOTICE',
      'TERMS',
    ]);
  });

  it('writes nothing when a check fails', async () => {
    const before = await prisma.reservation.count({ where: { userId: actor.id } });

    await expect(
      me.bookPackage(
        actor,
        request({ travelers: Array.from({ length: 4 }, () => request().travelers[1]) }),
        client,
      ),
    ).rejects.toBeInstanceOf(Error);
    await expect(
      me.bookPackage(
        actor,
        request({
          consents: [
            { purpose: 'TERMS', textVersion: 'terms@old' },
            ...request().consents.slice(1),
          ],
        }),
        client,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await prisma.reservation.count({ where: { userId: actor.id } })).toBe(before);
  });
});
