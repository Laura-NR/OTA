import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { parseTenantConfig } from '@ota/config';
import { Prisma } from '@ota/db';
import { InMemoryObjectStorage } from '@ota/storage';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DocumentsService } from '../src/documents/documents.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OBJECT_STORAGE } from '../src/storage/storage.module';
import { TENANT_CONFIG } from '../src/tenant/tenant.tokens';

const USERS = {
  ops: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ops@example.test',
    role: 'OPERATIONS_ADMIN',
  },
  ops2: {
    id: '12121212-1212-4212-8212-121212121212',
    email: 'ops2@example.test',
    role: 'OPERATIONS_ADMIN',
  },
  super: {
    id: '13131313-1313-4313-8313-131313131313',
    email: 'admin@example.test',
    role: 'SUPER_ADMIN',
  },
  owner: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'luis@example.test',
    role: 'TRAVELER',
  },
  other: {
    id: '23232323-2323-4323-8323-232323232323',
    email: 'other@example.test',
    role: 'TRAVELER',
  },
} as const;

const BOOKING = '33333333-3333-4333-8333-333333333333';

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
  payments: { cardFeePercent: 3 },
  policies: {
    deposit: {
      standard: {
        percent: 20,
        minDaysBeforeDeparture: 60,
        balanceDaysBeforeDeparture: 30,
      },
    },
    cancellation: {
      standard: {
        bands: [
          { fromDays: 46, keepPercent: 0, fee: 60 },
          { fromDays: 15, keepPercent: 25 },
          { fromDays: 0, keepPercent: 100 },
        ],
      },
    },
  },
});

type Row = Record<string, unknown> & { id: string };

interface State {
  reservation: Row;
  instalments: Row[];
  receipts: Row[];
  proofs: Row[];
  refunds: Row[];
  approvals: Row[];
  audits: Row[];
}

const decimal = (value: unknown) => new Prisma.Decimal(value as number | string);

function utcDaysFromNow(days: number): Date {
  const today = new Date();
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days),
  );
}

function seed(departureInDays = 120): State {
  return {
    reservation: {
      id: BOOKING,
      userId: USERS.owner.id,
      bookingCode: 'PAYSCH01',
      status: 'SECURED_AND_INVOICED',
      tourismCategory: 'GENERAL',
      startDate: utcDaysFromNow(departureInDays),
      endDate: utcDaysFromNow(departureInDays + 7),
      totalCurrency: 'EUR',
      totalAmount: decimal('3100.00'),
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    },
    instalments: [],
    receipts: [],
    proofs: [],
    refunds: [],
    approvals: [],
    audits: [],
  };
}

function createFakePrisma(state: State) {
  const users = Object.values(USERS);
  const byPosition = (a: Row, b: Row) => (a.position as number) - (b.position as number);
  const byCreated = (a: Row, b: Row) =>
    (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime();
  const instalmentsOf = () => [...state.instalments].sort(byPosition);
  const user = (id: unknown) => users.find((candidate) => candidate.id === id) ?? null;

  const refundRow = (refund: Row) => ({
    ...refund,
    approvals: state.approvals
      .filter((approval) => approval.refundId === refund.id)
      .sort(byCreated)
      .map((approval) => ({ ...approval, approver: user(approval.approverId) })),
    requestedBy: user(refund.requestedById),
    receipt: state.receipts.find((receipt) => receipt.id === refund.receiptId),
    reservation: { bookingCode: state.reservation.bookingCode },
  });
  const proofRow = (proof: Row) => {
    const receipt = state.receipts.find((candidate) => candidate.id === proof.receiptId)!;
    return {
      ...proof,
      receipt: {
        ...receipt,
        reservation: { bookingCode: state.reservation.bookingCode },
        instalment:
          state.instalments.find(
            (instalment) => instalment.id === receipt.instalmentId,
          ) ?? null,
      },
      uploadedBy: user(proof.uploadedById),
    };
  };
  const matchesStatus = (row: Row, status: unknown) =>
    status === undefined ||
    (typeof status === 'string'
      ? row.status === status
      : (status as { in: string[] }).in.includes(row.status as string));

  const fake = {
    reservationTraveler: { findMany: async () => [] },
    travelerAffidavit: { findMany: async () => [] },
    reservation: {
      findUnique: async (args: {
        where: { id: string };
        include?: Record<string, unknown>;
      }) => {
        if (args.where.id !== BOOKING) return null;
        const row = state.reservation;
        if (!args.include) return row;
        return {
          ...row,
          instalments: instalmentsOf(),
          package: { depositPolicy: 'standard', cancellationPolicy: 'standard' },
          payments: state.receipts.filter((receipt) => receipt.status === 'PAID'),
          refunds: state.refunds.filter((refund) =>
            ['REQUESTED', 'APPROVED', 'SENT'].includes(refund.status as string),
          ),
        };
      },
      findFirst: async (args: { where: { id: string; userId?: string } }) => {
        if (args.where.id !== BOOKING) return null;
        if (args.where.userId && args.where.userId !== state.reservation.userId)
          return null;
        return {
          ...state.reservation,
          instalments: instalmentsOf(),
          payments: [...state.receipts].sort(byCreated).map((receipt) => ({
            ...receipt,
            proofs: state.proofs.filter((proof) => proof.receiptId === receipt.id),
          })),
          refunds: [...state.refunds].sort(byCreated).map(refundRow),
          package: { depositPolicy: 'standard' },
        };
      },
      update: async (args: { data: Record<string, unknown> }) => {
        Object.assign(state.reservation, args.data);
        return state.reservation;
      },
    },
    paymentInstalment: {
      createMany: async (args: { data: Row[] }) => {
        state.instalments.push(
          ...args.data.map((row) => ({
            ...row,
            amount: decimal(row.amount),
            currency: 'EUR',
            status: 'DUE',
            paidAt: null,
          })),
        );
        return { count: args.data.length };
      },
      findUnique: async (args: { where: { id: string } }) =>
        state.instalments.find((row) => row.id === args.where.id) ?? null,
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = state.instalments.find(
          (candidate) => candidate.id === args.where.id,
        )!;
        Object.assign(row, args.data);
        return row;
      },
    },
    paymentReceipt: {
      create: async (args: { data: Row }) => {
        const row = {
          id: randomUUID(),
          payoutStatus: 'ACCRUED',
          createdAt: new Date(Date.now() + state.receipts.length),
          updatedAt: new Date(),
          ...args.data,
          amount: decimal(args.data.amount),
          feeAmount: decimal(args.data.feeAmount),
        };
        state.receipts.push(row);
        return row;
      },
      findUnique: async (args: { where: { id: string } }) =>
        state.receipts.find((row) => row.id === args.where.id) ?? null,
      findUniqueOrThrow: async (args: { where: { id: string } }) =>
        state.receipts.find((row) => row.id === args.where.id)!,
      findFirst: async (args: {
        where: { id: string; reservationId: string; reservation: { userId: string } };
      }) =>
        args.where.reservation.userId === state.reservation.userId
          ? (state.receipts.find((row) => row.id === args.where.id) ?? null)
          : null,
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = state.receipts.find((candidate) => candidate.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
    },
    paymentProof: {
      create: async (args: { data: Row }) => {
        const row = {
          id: randomUUID(),
          status: 'SUBMITTED',
          reviewedById: null,
          reviewedAt: null,
          reviewNote: null,
          createdAt: new Date(),
          ...args.data,
        };
        state.proofs.push(row);
        return row;
      },
      findMany: async (args: { where: { status: string } }) =>
        state.proofs.filter((proof) => proof.status === args.where.status).map(proofRow),
      findUnique: async (args: { where: { id: string } }) => {
        const proof = state.proofs.find((row) => row.id === args.where.id);
        return proof ? proofRow(proof) : null;
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) =>
        proofRow(state.proofs.find((row) => row.id === args.where.id)!),
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = state.proofs.find((candidate) => candidate.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
    },
    refund: {
      create: async (args: { data: Row }) => {
        const row = {
          id: randomUUID(),
          status: 'REQUESTED',
          providerRefundId: null,
          sentAt: null,
          rule: null,
          createdAt: new Date(Date.now() + state.refunds.length),
          updatedAt: new Date(),
          ...args.data,
          amount: decimal(args.data.amount),
        };
        state.refunds.push(row);
        return row;
      },
      findUnique: async (args: { where: { id?: string; providerRefundId?: string } }) => {
        const row = state.refunds.find((candidate) =>
          args.where.id
            ? candidate.id === args.where.id
            : candidate.providerRefundId === args.where.providerRefundId,
        );
        return row ? refundRow(row) : null;
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) =>
        refundRow(state.refunds.find((row) => row.id === args.where.id)!),
      findMany: async (args: { where: { status: unknown } }) =>
        state.refunds
          .filter((row) => matchesStatus(row, args.where.status))
          .map(refundRow),
      update: async (args: { where: { id: string }; data: Row }) => {
        const row = state.refunds.find((candidate) => candidate.id === args.where.id)!;
        Object.assign(row, args.data);
        return row;
      },
    },
    refundApproval: {
      create: async (args: { data: Row }) => {
        const row = { id: randomUUID(), createdAt: new Date(), ...args.data };
        state.approvals.push(row);
        return row;
      },
    },
    auditLog: {
      create: async (args: { data: Row }) => {
        state.audits.push(args.data);
        return args.data;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };
  return fake;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const found = Object.values(USERS).find((u) => u.email === headers['x-test-user']);
    return found
      ? {
          user: { id: found.id, email: found.email, role: found.role },
          session: { id: 'session-1', userId: found.id, expiresAt: new Date() },
        }
      : null;
  },
};

async function buildApp(state: State): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(createFakePrisma(state))
    .overrideProvider(AuthService)
    .useValue(fakeAuthService)
    .overrideProvider(TENANT_CONFIG)
    .useValue(tenant)
    .overrideProvider(OBJECT_STORAGE)
    .useValue(new InMemoryObjectStorage())
    .overrideProvider(DocumentsService)
    .useValue({ generate: async () => undefined })
    .compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('M4 payment schedule API', () => {
  let app: INestApplication;
  let state: State;

  const as = (who: keyof typeof USERS) => ({ 'x-test-user': USERS[who].email });
  const http = () => request(app.getHttpServer());
  const link = (body: Record<string, unknown>, who: keyof typeof USERS = 'ops') =>
    http().post(`/reservations/${BOOKING}/payments`).set(as(who)).send(body);
  const confirm = (receiptId: string) =>
    http().post(`/reservations/${BOOKING}/payments/${receiptId}/confirm`).set(as('ops'));

  async function start(departureInDays = 120) {
    state = seed(departureInDays);
    app = await buildApp(state);
  }

  afterEach(async () => {
    await app.close();
  });

  describe('schedule and links', () => {
    beforeEach(() => start());

    it('offers deposit or full before the first link, as the first link would build them', async () => {
      const response = await http()
        .get(`/reservations/${BOOKING}/schedule`)
        .set(as('ops'));

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        total: '3100.00',
        instalments: [],
        options: {
          full: { amount: '3100.00' },
          deposit: { amount: '620.00', balance: '2480.00', percent: 20 },
        },
        windowHours: 48,
        cardFeePercent: 3,
      });
    });

    it('fixes a deposit plan with the first link and charges the deposit', async () => {
      const response = await link({ rail: 'OPEN_BANKING_SEPA', plan: 'DEPOSIT' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ amount: '620', feeAmount: '0' });
      expect(state.instalments.map((row) => [row.kind, row.amount.toString()])).toEqual([
        ['DEPOSIT', '620'],
        ['BALANCE', '2480'],
      ]);
      expect(state.reservation.status).toBe('PENDING_PAYMENT');
      expect(state.audits.map((audit) => audit.action)).toContain(
        'payment.schedule_created',
      );

      // The traveler reopens the pending transfer's instructions by its reference.
      const mine = await http()
        .get(`/me/reservations/${BOOKING}/schedule`)
        .set(as('owner'));
      expect(mine.body.receipts[0].reference).toMatch(/^wire_/);
    });

    it('adds the card fee on top of the instalment, not into it', async () => {
      const response = await link({ rail: 'CARD', plan: 'FULL' });

      expect(response.body).toMatchObject({ amount: '3100', feeAmount: '93' });
      expect(state.instalments).toHaveLength(1);
    });

    it('confirms on the deposit, then takes the balance without changing the status', async () => {
      const deposit = await link({ rail: 'OPEN_BANKING_SEPA', plan: 'DEPOSIT' });
      const confirmed = await confirm(deposit.body.id);
      expect(confirmed.body.status).toBe('CONFIRMED');
      expect(state.instalments[0]).toMatchObject({ status: 'PAID' });

      const balance = await link({ rail: 'OPEN_BANKING_SEPA' });
      expect(balance.status).toBe(201);
      expect(balance.body.amount).toBe('2480');
      const paid = await confirm(balance.body.id);
      expect(paid.body.status).toBe('CONFIRMED');
      expect(state.instalments.map((row) => row.status)).toEqual(['PAID', 'PAID']);

      const nothing = await link({ rail: 'OPEN_BANKING_SEPA' });
      expect(nothing.status).toBe(409);
    });

    it('lets the desk give an instalment more time, audited', async () => {
      await link({ rail: 'OPEN_BANKING_SEPA', plan: 'FULL' });
      const instalment = state.instalments[0]!;
      const before = (instalment.dueAt as Date).getTime();

      const response = await http()
        .post(`/reservations/${BOOKING}/instalments/${instalment.id}/extend`)
        .set(as('ops'))
        .send({ hours: 24 });

      expect(response.status).toBe(200);
      expect(new Date(response.body.dueAt).getTime() - before).toBe(24 * 3_600_000);
      expect(state.audits.map((audit) => audit.action)).toContain(
        'payment.window_extended',
      );
    });

    it('shows the traveler their own schedule and nobody else', async () => {
      const mine = await http()
        .get(`/me/reservations/${BOOKING}/schedule`)
        .set(as('owner'));
      expect(mine.status).toBe(200);
      const theirs = await http()
        .get(`/me/reservations/${BOOKING}/schedule`)
        .set(as('other'));
      expect(theirs.status).toBe(404);
    });
  });

  describe('a departure too close for a deposit', () => {
    beforeEach(() => start(30));

    it('offers the full amount only and refuses a deposit plan', async () => {
      const schedule = await http()
        .get(`/reservations/${BOOKING}/schedule`)
        .set(as('ops'));
      expect(schedule.body.options.deposit).toBeNull();

      const refused = await link({ rail: 'OPEN_BANKING_SEPA', plan: 'DEPOSIT' });
      expect(refused.status).toBe(409);
      expect(state.instalments).toHaveLength(0);
    });
  });

  describe('proofs of transfer', () => {
    beforeEach(() => start());

    const upload = (receiptId: string, who: keyof typeof USERS = 'owner') =>
      http()
        .post(`/me/reservations/${BOOKING}/payments/${receiptId}/proof`)
        .set(as(who))
        .send({
          contentType: 'application/pdf',
          contentBase64: Buffer.from('%PDF-1.4').toString('base64'),
        });

    it('takes a proof from the owner for a pending transfer, not for a card or a stranger', async () => {
      const wire = await link({ rail: 'OPEN_BANKING_SEPA', plan: 'DEPOSIT' });
      expect((await upload(wire.body.id)).status).toBe(201);
      expect((await upload(wire.body.id, 'other')).status).toBe(404);

      const card = await link({ rail: 'CARD' });
      expect((await upload(card.body.id)).status).toBe(409);
    });

    it('queues the proof for the desk, reads its file audited, and extends the window on accept', async () => {
      const wire = await link({ rail: 'OPEN_BANKING_SEPA', plan: 'DEPOSIT' });
      await upload(wire.body.id);
      const dueBefore = state.instalments[0]!.dueAt as Date;

      const queue = await http().get('/payments/proofs').set(as('ops'));
      expect(queue.body).toEqual([
        expect.objectContaining({
          bookingCode: 'PAYSCH01',
          instalmentKind: 'DEPOSIT',
          contentType: 'application/pdf',
          uploadedByEmail: USERS.owner.email,
        }),
      ]);
      expect(JSON.stringify(queue.body)).not.toContain('payment-proofs/');

      const proofId = queue.body[0].id as string;
      const file = await http().get(`/payments/proofs/${proofId}/file`).set(as('ops'));
      expect(file.status).toBe(200);
      expect(file.headers['cache-control']).toBe('no-store');
      expect(state.audits.map((audit) => audit.action)).toContain('payment.proof_viewed');

      const accepted = await http()
        .post(`/payments/proofs/${proofId}/accept`)
        .set(as('ops'))
        .send({});
      expect(accepted.body.status).toBe('ACCEPTED');
      expect((state.instalments[0]!.dueAt as Date).getTime()).toBeGreaterThan(
        dueBefore.getTime(),
      );

      const again = await http()
        .post(`/payments/proofs/${proofId}/reject`)
        .set(as('ops'))
        .send({ note: 'Too late' });
      expect(again.status).toBe(409);
    });

    it('needs a note to reject a proof, which the traveler then sees', async () => {
      const wire = await link({ rail: 'OPEN_BANKING_SEPA', plan: 'FULL' });
      const proof = await upload(wire.body.id);

      const bare = await http()
        .post(`/payments/proofs/${proof.body.id}/reject`)
        .set(as('ops'))
        .send({});
      expect(bare.status).toBe(400);

      await http()
        .post(`/payments/proofs/${proof.body.id}/reject`)
        .set(as('ops'))
        .send({ note: 'The amount on the receipt is not the deposit.' });
      const schedule = await http()
        .get(`/me/reservations/${BOOKING}/schedule`)
        .set(as('owner'));
      expect(schedule.body.receipts[0].proofs[0]).toMatchObject({
        status: 'REJECTED',
        reviewNote: 'The amount on the receipt is not the deposit.',
      });
    });
  });

  describe('refunds', () => {
    beforeEach(() => start());

    async function paidDeposit(rail = 'OPEN_BANKING_SEPA') {
      const deposit = await link({ rail, plan: 'DEPOSIT' });
      await confirm(deposit.body.id);
      return deposit.body.id as string;
    }

    const create = (body: Record<string, unknown>) =>
      http().post(`/reservations/${BOOKING}/refunds`).set(as('ops')).send(body);
    const vote = (id: string, who: keyof typeof USERS, approve = true) =>
      http()
        .post(`/refunds/${id}/${approve ? 'approve' : 'reject'}`)
        .set(as(who))
        .send(approve ? {} : { note: 'Not covered' });

    it('suggests the cancellation scale and records the band it used', async () => {
      const receiptId = await paidDeposit();

      const quote = await http()
        .get(`/reservations/${BOOKING}/refunds/quote`)
        .query({ receiptId, reason: 'TRAVELER_CANCELLATION' })
        .set(as('ops'));
      // 120 days out: the first band keeps only the € 60 fee of the € 620 paid.
      expect(quote.body).toMatchObject({ paid: '620.00', suggested: '560.00' });
      expect(quote.body.rule).toMatchObject({
        policyKey: 'standard',
        fromDays: 46,
        fee: 60,
      });

      const refund = await create({
        receiptId,
        reason: 'TRAVELER_CANCELLATION',
        note: 'Cancelled by email.',
      });
      expect(refund.status).toBe(201);
      expect(refund.body).toMatchObject({
        amount: '560.00',
        status: 'REQUESTED',
        // € 560 is above the € 500 single limit: two different approvers.
        decision: { state: 'PENDING', missing: 2, superAdmin: false },
      });
    });

    it('approves within the single limit, then records the bank reference for a transfer', async () => {
      const receiptId = await paidDeposit();
      const refund = await create({
        receiptId,
        reason: 'GOODWILL',
        note: 'Late transfer',
        amount: 120,
      });

      const approved = await vote(refund.body.id, 'ops');
      expect(approved.body.status).toBe('APPROVED');

      const sent = await http()
        .post(`/refunds/${refund.body.id}/sent`)
        .set(as('ops'))
        .send({ reference: 'BANK-REF-0001' });
      expect(sent.body).toMatchObject({
        status: 'SENT',
        providerRefundId: 'BANK-REF-0001',
      });
    });

    it('sends a card refund through the gateway with the refund id as idempotency key', async () => {
      const receiptId = await paidDeposit('CARD');
      const refund = await create({
        receiptId,
        reason: 'GOODWILL',
        note: 'Upgrade unavailable',
        amount: 100,
      });

      const approved = await vote(refund.body.id, 'ops');
      expect(approved.body).toMatchObject({
        status: 'SENT',
        providerRefundId: `mock_refund_${refund.body.id}`,
      });
    });

    it('needs two different people between the limits, and a Super Admin above them', async () => {
      const receiptId = await paidDeposit();
      const dual = await create({
        receiptId,
        reason: 'FORCE_MAJEURE',
        note: 'Hurricane',
      });
      expect(dual.body.amount).toBe('620.00');

      // 620 is above the € 500 single limit.
      expect((await vote(dual.body.id, 'ops')).body.decision).toMatchObject({
        missing: 1,
      });
      expect((await vote(dual.body.id, 'ops')).status).toBe(409);
      expect((await vote(dual.body.id, 'ops2')).body.status).toBe('APPROVED');
    });

    it('refuses more than is left on the payment, and one rejection rejects', async () => {
      const receiptId = await paidDeposit();
      const tooMuch = await create({
        receiptId,
        reason: 'GOODWILL',
        note: 'Too much',
        amount: 700,
      });
      expect(tooMuch.status).toBe(400);

      const refund = await create({
        receiptId,
        reason: 'GOODWILL',
        note: 'Gesture',
        amount: 50,
      });
      const rejected = await vote(refund.body.id, 'ops2', false);
      expect(rejected.body.status).toBe('REJECTED');
    });

    it('leaves a refund above the dual limit waiting for a Super Admin', async () => {
      const full = await link({ rail: 'OPEN_BANKING_SEPA', plan: 'FULL' });
      await confirm(full.body.id);
      const refund = await create({
        receiptId: full.body.id,
        reason: 'HOST_CANCELLATION',
        note: 'Casa closed',
      });
      expect(refund.body.amount).toBe('3100.00');

      await vote(refund.body.id, 'ops');
      const pending = await vote(refund.body.id, 'ops2');
      expect(pending.body.decision).toEqual({
        state: 'PENDING',
        missing: 1,
        superAdmin: true,
      });

      expect((await vote(refund.body.id, 'super')).body.status).toBe('APPROVED');
    });
  });
});
