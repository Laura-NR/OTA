import { parseTenantConfig } from '@ota/config';
import { PrismaClient } from '@ota/db';
import type { EmailMessage } from '@ota/email';
import { InMemoryObjectStorage } from '@ota/storage';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import { ProposalsService } from '../src/proposals/proposals.service';
import type { PrismaService } from '../src/prisma/prisma.service';

// Prisma Client auto-loads packages/db/.env, so require an explicit opt-in.
const runIntegration = process.env.RUN_DB_INTEGRATION === '1';

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
  proposals: {
    validityDays: 21,
    responseHours: 4,
    planningFee: 140,
    defaultDepositPolicy: 'standard',
    defaultCancellationPolicy: 'standard',
  },
});

/**
 * Live proof of the M5 flow against Postgres: a request becomes a priced,
 * immutable version with its D-Proposal PDF stored and attached to the email;
 * accepting it creates the booking, its frozen price lines and its service
 * items in one transaction; a second acceptance is idempotent. A renderer
 * failure still sends the version, without a PDF.
 * Run with `RUN_DB_INTEGRATION=1 pnpm --filter @ota/api exec vitest run
 * test/proposals.integration.test.ts` against a migrated dev database.
 */
describe.skipIf(!runIntegration)('custom proposals (live Postgres)', () => {
  let prisma: PrismaClient;
  let service: ProposalsService;
  let actor: AuthUser;
  let itemId = '';
  const stamp = Date.now();
  const sent: EmailMessage[] = [];
  const storage = new InMemoryObjectStorage();
  const rendered: string[] = [];
  let failRender = false;

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new ProposalsService(
      prisma as unknown as PrismaService,
      {
        send: async (message) => {
          sent.push(message);
        },
      },
      tenant,
      {
        // A stand-in for Chromium: the PDF is the HTML's bytes behind a PDF header.
        render: async (html) => {
          if (failRender) {
            throw new Error('renderer down');
          }
          rendered.push(html);
          return new TextEncoder().encode(`%PDF-1.7\n${html.length}`);
        },
      },
      storage,
    );

    const user = await prisma.user.create({
      data: {
        email: `proposal-it-${stamp}@example.test`,
        fullName: 'Proposal Integration',
        role: 'TRAVELER',
        locale: 'en',
      },
    });
    actor = { id: user.id, email: user.email, role: 'TRAVELER' } as AuthUser;

    const item = await prisma.inventoryItem.create({
      data: {
        type: 'ACCOMMODATION',
        name: `Proposal IT Casa ${stamp}`,
        province: 'Trinidad',
        basePrice: '900.00',
      },
    });
    itemId = item.id;
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({
      where: { email: `proposal-it-${stamp}@example.test` },
    });
    if (user) {
      const requests = await prisma.customRequest.findMany({
        where: { userId: user.id },
        select: { id: true, proposals: { select: { id: true, reservationId: true } } },
      });
      const reservationIds = requests.flatMap((request) =>
        request.proposals.flatMap((proposal) =>
          proposal.reservationId ? [proposal.reservationId] : [],
        ),
      );
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { entityType: 'CustomRequest', entityId: { in: requests.map((r) => r.id) } },
            {
              entityType: 'Proposal',
              entityId: { in: requests.flatMap((r) => r.proposals.map((p) => p.id)) },
            },
            {
              entityType: 'Reservation',
              entityId: { in: reservationIds },
            },
          ],
        },
      });
      if (reservationIds.length > 0) {
        await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
      }
      await prisma.customRequest.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await prisma.inventoryItem.deleteMany({
      where: { name: `Proposal IT Casa ${stamp}` },
    });
    await prisma.$disconnect();
  });

  it('prices a request, accepts it and creates one booking', async () => {
    const request = await service.createRequest(actor, {
      startDate: new Date('2027-03-04T00:00:00Z'),
      endDate: new Date('2027-03-18T00:00:00Z'),
      adults: 2,
      children: 1,
      inventoryItemIds: [itemId],
      notes: 'Birding first, long walks, casas only.',
      locale: 'en',
    });
    expect(request.reference).toMatch(/^VX-C-/);

    const draft = await service.getForUser(actor.id, request.id);
    expect(draft.status).toBe('DRAFT');
    expect(draft.request.payload.adults).toBe(2);
    expect(draft.request.payload.inventoryItemIds).toEqual([itemId]);
    expect(draft.request.notes).toContain('Birding');

    const priced = await service.createVersion(actor, request.id, {
      summary: 'Fourteen days west to Trinidad.',
      validUntil: new Date('2027-01-15T00:00:00Z'),
      currency: 'EUR',
      lines: [
        {
          kind: 'LODGING',
          unit: 'PER_BOOKING',
          label: 'Casas, 13 nights',
          description: 'Four casas, breakfast',
          quantity: 1,
          unitAmount: 1000,
          inventoryItemId: itemId,
        },
        {
          kind: 'FEE',
          unit: 'PER_BOOKING',
          label: 'Vereda service fee',
          quantity: 1,
          unitAmount: 100,
        },
      ],
      stops: [],
      days: [],
      options: [],
    });

    expect(priced.status).toBe('SENT');
    expect(priced.currentVersion).toBe(1);
    expect(priced.versions[0]!.total).toBe('1100.00');
    expect(priced.versions[0]!.perPerson).toBe('366.67');
    expect(sent.at(-1)?.to).toBe(actor.email);
    expect(sent.at(-1)?.subject).toContain(request.reference);

    // The D-Proposal PDF: rendered from the version, stored, attached, and
    // readable by its traveler and the desk only.
    expect(priced.versions[0]!.hasPdf).toBe(true);
    expect(rendered.at(-1)).toContain('Fourteen days west to Trinidad.');
    expect(rendered.at(-1)).toContain('Casas, 13 nights');
    const stored = await prisma.proposalVersion.findUniqueOrThrow({
      where: { id: priced.versions[0]!.id },
    });
    expect(stored.pdfKey).toBe(`proposals/${request.id}/v1.pdf`);
    expect(sent.at(-1)?.attachments?.[0]).toMatchObject({
      filename: `${request.reference}-v1.pdf`,
      contentType: 'application/pdf',
    });
    const own = await service.pdfForUser(actor.id, request.id, priced.versions[0]!.id);
    expect(new TextDecoder().decode(own.body)).toMatch(/^%PDF-/);
    expect(own.filename).toBe(`${request.reference}-v1.pdf`);
    await expect(
      service.pdfForUser(
        '00000000-0000-4000-8000-000000000000',
        request.id,
        priced.versions[0]!.id,
      ),
    ).rejects.toThrow('No PDF');
    const desk = await service.pdfForOps(request.id, priced.versions[0]!.id);
    expect(desk.body).toEqual(own.body);

    const accepted = await service.acceptForUser(
      actor,
      request.id,
      priced.versions[0]!.id,
    );
    expect(accepted.bookingCode).toMatch(/^[A-Z0-9]{8}$/);

    const reservation = await prisma.reservation.findUniqueOrThrow({
      where: { id: accepted.reservationId },
      include: { priceLines: true, serviceItems: true },
    });
    expect(reservation).toMatchObject({
      userId: actor.id,
      status: 'ITINERARY_SUBMITTED',
      partySize: 3,
      totalCurrency: 'EUR',
      customItineraryPayload: {
        requestId: request.requestId,
        proposalId: request.id,
        proposalVersionId: priced.versions[0]!.id,
      },
    });
    expect(reservation.totalAmount.toString()).toBe('1100');
    expect(reservation.priceLines.map((line) => line.kind)).toEqual(['SERVICE', 'FEE']);
    expect(
      reservation.priceLines.reduce((sum, line) => sum + Number(line.amount), 0),
    ).toBeCloseTo(1100, 2);
    expect(reservation.serviceItems).toHaveLength(1);

    const acceptedProposal = await service.getForUser(actor.id, request.id);
    expect(acceptedProposal.status).toBe('ACCEPTED');
    expect(acceptedProposal.reservationId).toBe(accepted.reservationId);
    expect(acceptedProposal.request.status).toBe('CONVERTED');
    // Nothing is dispatched yet: one service, waiting for the desk.
    expect(acceptedProposal.providers).toEqual({
      services: 1,
      confirmed: 0,
      awaiting: 0,
      arranging: 1,
      requestsSent: 0,
      answered: 0,
    });

    const audits = await prisma.auditLog.findMany({
      where: { entityType: 'Proposal', entityId: request.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((audit) => audit.action)).toEqual([
      'proposal.sent',
      'proposal.accepted',
    ]);

    const again = await service.acceptForUser(actor, request.id, priced.versions[0]!.id);
    expect(again).toEqual(accepted);
  });

  it('sends the version without a PDF when the renderer fails', async () => {
    const request = await service.createRequest(actor, {
      startDate: new Date('2027-05-01T00:00:00Z'),
      endDate: new Date('2027-05-08T00:00:00Z'),
      adults: 1,
      children: 0,
      inventoryItemIds: [itemId],
      locale: 'es',
    });
    failRender = true;
    try {
      const priced = await service.createVersion(actor, request.id, {
        summary: 'Una semana en Trinidad.',
        currency: 'EUR',
        lines: [
          {
            kind: 'LODGING',
            unit: 'PER_BOOKING',
            label: 'Casa',
            quantity: 1,
            unitAmount: 500,
          },
        ],
        stops: [],
        days: [],
        options: [],
      });
      expect(priced.status).toBe('SENT');
      expect(priced.versions[0]!.hasPdf).toBe(false);
      expect(sent.at(-1)?.subject).toContain(request.reference);
      expect(sent.at(-1)?.attachments).toBeUndefined();
      await expect(
        service.pdfForUser(actor.id, request.id, priced.versions[0]!.id),
      ).rejects.toThrow('No PDF');
    } finally {
      failRender = false;
    }
  });
});
