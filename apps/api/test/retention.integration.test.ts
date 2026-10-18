import { randomUUID } from 'node:crypto';

import type { TenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import type { Mailer } from '@ota/email';
import { createObjectStorage } from '@ota/storage';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { PrismaService } from '../src/prisma/prisma.service';
import { NoopRetentionScheduler } from '../src/retention/retention.scheduler';
import { RetentionService } from '../src/retention/retention.service';

// Prisma Client auto-loads packages/db/.env, so DATABASE_URL is always present;
// require an explicit opt-in so the default unit suite stays database-free.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Live proof of the retention lifecycle against Postgres: the 6-month notice is
 * sent, the keep-alive link grants consent, and the 30-day grace anonymizes the
 * traveler while keeping the reservation. Run with
 * `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/retention.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('RetentionService (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: RetentionService;
  let send: ReturnType<typeof vi.fn>;
  let userId = '';
  let reservationId = '';
  let disruptionCaseId = '';
  let keptAffidavitId = '';
  let expiredAffidavitId = '';
  const email = `retention-e2e-${Date.now()}@example.test`;

  beforeAll(async () => {
    process.env.AUTH_SECRET ??= 'retention-integration-secret-0123456789';
    prisma = new PrismaClient();
    send = vi.fn(async () => undefined);
    service = new RetentionService(
      prisma as unknown as PrismaService,
      { send } as unknown as Mailer,
      {
        branding: {
          agencyName: 'Integration Test Agency',
          licenseNumber: 'MINTUR-TEST-0000',
          primaryColor: '#0f766e',
        },
      } as unknown as TenantConfig,
      new NoopRetentionScheduler(),
      createObjectStorage({ bucket: 'retention-test', region: 'us-east-1' }),
    );

    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Retention Test Traveler',
        phone: '+53 5555 9999',
        nationality: 'ES',
        role: 'TRAVELER',
      },
    });
    userId = user.id;

    const reservation = await prisma.reservation.create({
      data: {
        userId,
        bookingCode: `RTN${Date.now()}`,
        startDate: new Date(Date.now() - 220 * DAY_MS),
        endDate: new Date(Date.now() - 210 * DAY_MS),
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 200 * DAY_MS),
        totalCurrency: 'EUR',
        totalAmount: '321.00',
        customItineraryPayload: { notes: 'PII itinerary notes' },
        serviceItems: {
          create: [
            {
              serviceType: 'GUIDE',
              serviceDateStart: new Date(Date.now() - 215 * DAY_MS),
              serviceDateEnd: new Date(Date.now() - 215 * DAY_MS),
              province: 'La Habana',
              status: 'DECLINED',
              declineReason: 'PII supplier decline reason',
            },
          ],
        },
      },
    });
    reservationId = reservation.id;

    // M2 party PII that the purge must scrub.
    await prisma.reservationTraveler.create({
      data: {
        reservationId,
        isLead: true,
        fullName: 'Retention Test Traveler',
        dateOfBirth: new Date('1980-01-01T00:00:00Z'),
        nationality: 'ES',
        passportNumberEnc: 'v1.iv.tag.ciphertext',
        passportExpiresAt: new Date('2031-01-01T00:00:00Z'),
        emergencyContactName: 'PII emergency contact',
        emergencyContactPhone: '+34 600 000 000',
      },
    });

    // M3: a consent the purge must detach, an affidavit it must keep, and one
    // past its five years that the sweep deletes.
    await prisma.consentRecord.create({
      data: {
        userId,
        reservationId,
        purpose: 'MARKETING_EMAIL',
        granted: true,
        textVersion: 'marketing@test',
        source: 'ACCOUNT',
      },
    });
    const affidavit = {
      reservationId,
      category: 'SUPPORT_FOR_THE_CUBAN_PEOPLE' as const,
      signerName: 'Retention Test Traveler',
      bookingCode: 'RTN-AFFIDAVIT',
      travelStart: new Date(Date.now() - 220 * DAY_MS),
      travelEnd: new Date(Date.now() - 210 * DAY_MS),
      statementVersion: 'ofac@test',
      statementHash: 'a'.repeat(64),
      signature: 'Retention Test Traveler',
      signedAt: new Date(Date.now() - 230 * DAY_MS),
    };
    keptAffidavitId = (
      await prisma.travelerAffidavit.create({
        data: { ...affidavit, retainUntil: new Date(Date.now() + 1000 * DAY_MS) },
      })
    ).id;
    expiredAffidavitId = (
      await prisma.travelerAffidavit.create({
        data: { ...affidavit, retainUntil: new Date(Date.now() - DAY_MS) },
      })
    ).id;

    // Tier 1 free-text PII that the purge must scrub.
    await prisma.message.create({
      data: { reservationId, sender: 'TRAVELER', body: 'My passport is P1234567' },
    });
    await prisma.review.create({
      data: { reservationId, rating: 5, comment: 'PII review comment' },
    });
    await prisma.incident.create({
      data: {
        reservationId,
        category: 'MEDICAL',
        description: 'PII incident description',
        severity: 'HIGH',
      },
    });
    await prisma.auditLog.create({
      data: {
        action: 'reservation.transition',
        entityType: 'Reservation',
        entityId: reservationId,
        metadata: { from: 'A', to: 'B', reason: 'PII audit reason' },
      },
    });
    // M8: a case's status-board note and its log line about this booking;
    // the line about another booking in the same case must survive.
    const disruption = await prisma.disruptionCase.create({
      data: {
        reference: `DC-RET-${Date.now()}`,
        scenario: 'outage',
        severity: 'MAJOR',
        title: 'Outage',
        summary: 'Outage',
        policy: 'Vouchers',
        bookings: {
          create: [
            { reservationId, safety: 'SAFE', safetyNote: 'SMS from +53 5555 1234' },
          ],
        },
      },
    });
    disruptionCaseId = disruption.id;
    await prisma.auditLog.createMany({
      data: [
        {
          action: 'disruption.safety_marked',
          entityType: 'DisruptionCase',
          entityId: disruption.id,
          metadata: { reservationId, safety: 'SAFE', note: 'SMS from +53 5555 1234' },
        },
        {
          action: 'disruption.safety_marked',
          entityType: 'DisruptionCase',
          entityId: disruption.id,
          metadata: { reservationId: randomUUID(), safety: 'SAFE', note: 'other party' },
        },
      ],
    });
    await prisma.verification.create({
      data: {
        id: randomUUID(),
        identifier: `magic-link:${email}`,
        value: 'token',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  });

  afterAll(async () => {
    if (!prisma) {
      return;
    }
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: 'User', entityId: userId },
          { entityType: 'Reservation', entityId: reservationId },
          { entityType: 'DisruptionCase', entityId: disruptionCaseId },
        ],
      },
    });
    await prisma.disruptionCase.deleteMany({ where: { id: disruptionCaseId } });
    await prisma.verification.deleteMany({
      where: { identifier: { contains: email } },
    });
    await prisma.travelerAffidavit.deleteMany({
      where: { id: { in: [keptAffidavitId, expiredAffidavitId] } },
    });
    await prisma.consentRecord.deleteMany({ where: { reservationId } });
    // Messages, reviews, incidents, travelers and service items cascade with the booking.
    await prisma.reservation.deleteMany({ where: { id: reservationId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('sends the notice, records consent, then anonymizes after the grace', async () => {
    const first = await service.scan();
    expect(first).toEqual({ noticed: 1, reminded: 0, purged: 0, affidavitsDeleted: 1 });
    expect(
      await prisma.travelerAffidavit.findUnique({ where: { id: expiredAffidavitId } }),
    ).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);

    const message = send.mock.calls[0][0] as { to: string; html: string };
    expect(message.to).toBe(email);
    const match = message.html.match(/keep-alive\?token=([^"&<]+)/);
    expect(match).toBeTruthy();

    let user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.retentionNoticeSentAt).not.toBeNull();

    const consent = await service.confirmKeepAlive(decodeURIComponent(match![1]));
    expect(consent.status).toBe(200);
    user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.retentionConsentGrantedAt).not.toBeNull();

    // Simulate an ignored notice: rewind past the grace with no consent.
    await prisma.user.update({
      where: { id: userId },
      data: {
        retentionNoticeSentAt: new Date(Date.now() - 31 * DAY_MS),
        retentionConsentGrantedAt: null,
      },
    });

    const second = await service.scan();
    expect(second).toEqual({ noticed: 0, reminded: 0, purged: 1, affidavitsDeleted: 0 });

    // M3 D6: the consent log loses who; the affidavit keeps its five years.
    const consentRow = await prisma.consentRecord.findFirstOrThrow({
      where: { reservationId },
    });
    expect(consentRow).toMatchObject({ userId: null, visitorId: null, granted: true });
    const kept = await prisma.travelerAffidavit.findUniqueOrThrow({
      where: { id: keptAffidavitId },
    });
    expect(kept.signerName).toBe('Retention Test Traveler');

    user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.email).toBe(`anonymized+${userId}@anonymized.invalid`);
    expect(user.fullName).toBeNull();
    expect(user.phone).toBeNull();
    expect(user.nationality).toBeNull();
    expect(user.anonymizedAt).not.toBeNull();

    // The fiscal record survives the purge.
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });
    expect(reservation).not.toBeNull();
    expect(reservation?.totalAmount.toString()).toBe('321');

    // Tier 1: reservation-scoped free text is redacted.
    expect(reservation?.customItineraryPayload).toBeNull();

    // M2: the party keeps its shape but not who travelled.
    const traveler = await prisma.reservationTraveler.findFirstOrThrow({
      where: { reservationId },
    });
    expect(traveler).toMatchObject({
      isLead: true,
      kind: 'ADULT',
      fullName: '[redacted]',
      dateOfBirth: null,
      nationality: null,
      passportNumberEnc: null,
      passportExpiresAt: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
    });

    const storedMessage = await prisma.message.findFirstOrThrow({
      where: { reservationId },
    });
    expect(storedMessage.body).toBe('[redacted]');

    const review = await prisma.review.findFirstOrThrow({
      where: { reservationId },
    });
    expect(review.comment).toBeNull();
    expect(review.rating).toBe(5);

    const incident = await prisma.incident.findFirstOrThrow({
      where: { reservationId },
    });
    expect(incident.description).toBe('[redacted]');
    expect(incident.severity).toBe('HIGH');

    const serviceItem = await prisma.serviceItem.findFirstOrThrow({
      where: { reservationId },
    });
    expect(serviceItem.declineReason).toBeNull();

    // Better Auth tokens for the old address are gone.
    const verifications = await prisma.verification.count({
      where: { identifier: { contains: email } },
    });
    expect(verifications).toBe(0);

    // Audit metadata keeps its non-PII context but loses the free text.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: reservationId, action: 'reservation.transition' },
    });
    expect(audit.metadata).toMatchObject({ from: 'A', to: 'B' });
    expect((audit.metadata as Record<string, unknown>).reason).toBeUndefined();

    // M8: the safety state stays for the incident report; the notes go, and
    // only this traveler's lines in the shared case log lose theirs.
    const caseBooking = await prisma.disruptionCaseBooking.findFirstOrThrow({
      where: { reservationId },
    });
    expect(caseBooking.safety).toBe('SAFE');
    expect(caseBooking.safetyNote).toBeNull();
    const caseLog = await prisma.auditLog.findMany({
      where: { entityType: 'DisruptionCase', entityId: disruptionCaseId },
    });
    const notes = caseLog.map((row) => row.metadata as Record<string, unknown>);
    expect(
      notes.find((row) => row.reservationId === reservationId)?.note,
    ).toBeUndefined();
    expect(notes.find((row) => row.reservationId !== reservationId)?.note).toBe(
      'other party',
    );
  }, 20_000);
});
