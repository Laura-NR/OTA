import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * RBAC matrix (spec §2, §8): every operations/financial/customer endpoint is
 * denied to travelers and service workers, and worker-only dispatch actions are
 * denied to everyone else. Guards run before pipes and services, so a denied
 * request is 403 regardless of the path params or body.
 */
const USERS = {
  superAdmin: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.test',
    role: 'SUPER_ADMIN',
  },
  operations: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'ops@example.test',
    role: 'OPERATIONS_ADMIN',
  },
  support: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'support@example.test',
    role: 'ADMINISTRATIVE_SUPPORT',
  },
  worker: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'guide@example.test',
    role: 'SERVICE_WORKER',
  },
  traveler: {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'traveler@example.test',
    role: 'TRAVELER',
  },
} as const;

const RESERVATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVICE_ITEM = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const INVENTORY = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUPPLIER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PACKAGE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const INCIDENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const IMPORT = '10101010-1010-4010-8010-101010101010';
const APPLICATION = '20202020-2020-4020-8020-202020202020';
const RULE = '30303030-3030-4030-8030-303030303030';
const MEDIA = '40404040-4040-4040-8040-404040404040';
const PAYMENT = '50505050-5050-4050-8050-505050505050';
const CUSTOMER = '60606060-6060-4060-8060-606060606060';
const TRAVELER_ROW = '70707070-7070-4070-8070-707070707070';
const EXTRA = '80808080-8080-4080-8080-808080808080';
const AFFIDAVIT = '90909090-9090-4090-8090-909090909090';
const INSTALMENT = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const PROOF = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
const REFUND = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
const PROPOSAL = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
const PROPOSAL_VERSION = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';

type Allowed = 'opsRead' | 'opsWrite' | 'superAdmin' | 'worker' | 'authenticated';
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface Route {
  method: Method;
  path: string;
  allowed: Allowed;
}

const ROUTES: Route[] = [
  // Financial / BI / regulatory — ops only.
  { method: 'get', path: '/analytics/overview', allowed: 'opsRead' },
  { method: 'get', path: '/analytics/regulatory', allowed: 'opsRead' },
  { method: 'get', path: '/analytics/regulatory/fiscal-export', allowed: 'opsRead' },
  { method: 'get', path: '/analytics/export/xlsx', allowed: 'opsRead' },
  { method: 'get', path: '/analytics/export/pdf', allowed: 'opsRead' },
  { method: 'post', path: '/assistant/draft-reply', allowed: 'opsRead' },
  { method: 'get', path: '/assistant/ops-summary', allowed: 'opsRead' },
  { method: 'post', path: '/assistant/translate', allowed: 'opsRead' },

  // Reservations + payments + documents.
  { method: 'get', path: '/reservations', allowed: 'opsRead' },
  { method: 'post', path: '/reservations', allowed: 'opsWrite' },
  { method: 'get', path: `/reservations/${RESERVATION}`, allowed: 'opsRead' },
  { method: 'get', path: `/reservations/${RESERVATION}/audit`, allowed: 'opsRead' },
  { method: 'get', path: `/reservations/${RESERVATION}/payments`, allowed: 'opsRead' },
  { method: 'get', path: '/payments', allowed: 'opsRead' },
  { method: 'post', path: '/payments/reminders/scan', allowed: 'opsWrite' },
  { method: 'post', path: '/payments/reminders/window-scan', allowed: 'opsWrite' },
  { method: 'post', path: '/notifications/scan', allowed: 'opsWrite' },
  { method: 'post', path: `/reservations/${RESERVATION}/payments`, allowed: 'opsWrite' },
  {
    method: 'post',
    path: `/reservations/${RESERVATION}/payments/${PAYMENT}/confirm`,
    allowed: 'opsWrite',
  },
  {
    method: 'patch',
    path: `/reservations/${RESERVATION}/tourism-category`,
    allowed: 'opsWrite',
  },
  {
    method: 'post',
    path: `/reservations/${RESERVATION}/transition`,
    allowed: 'opsWrite',
  },
  { method: 'get', path: `/reservations/${RESERVATION}/documents`, allowed: 'opsRead' },
  { method: 'post', path: `/reservations/${RESERVATION}/documents`, allowed: 'opsWrite' },

  // M2 party, extras, price lines; the passport vault is writers-only.
  { method: 'get', path: `/reservations/${RESERVATION}/travelers`, allowed: 'opsRead' },
  { method: 'put', path: `/reservations/${RESERVATION}/travelers`, allowed: 'opsWrite' },
  {
    method: 'get',
    path: `/reservations/${RESERVATION}/travelers/${TRAVELER_ROW}/passport`,
    allowed: 'opsWrite',
  },
  { method: 'post', path: `/reservations/${RESERVATION}/extras`, allowed: 'opsWrite' },
  {
    method: 'delete',
    path: `/reservations/${RESERVATION}/extras/${EXTRA}`,
    allowed: 'opsWrite',
  },
  { method: 'get', path: `/reservations/${RESERVATION}/price-lines`, allowed: 'opsRead' },

  // M3 compliance: statuses for every ops role; records, scans and paper
  // affidavits for writers; the legal export for the Super Admin alone.
  { method: 'get', path: `/reservations/${RESERVATION}/ofac`, allowed: 'opsRead' },
  {
    method: 'post',
    path: `/reservations/${RESERVATION}/travelers/${TRAVELER_ROW}/affidavit`,
    allowed: 'opsWrite',
  },
  { method: 'get', path: '/affidavits/export', allowed: 'superAdmin' },
  { method: 'get', path: `/affidavits/${AFFIDAVIT}`, allowed: 'opsWrite' },
  { method: 'get', path: `/affidavits/${AFFIDAVIT}/document`, allowed: 'opsWrite' },
  { method: 'get', path: `/customers/${CUSTOMER}/consents`, allowed: 'opsRead' },
  {
    method: 'post',
    path: `/customers/${CUSTOMER}/certification-reminder`,
    allowed: 'opsWrite',
  },
  // The traveler's own (scoped to the caller in the service).
  {
    method: 'get',
    path: `/me/reservations/${RESERVATION}/ofac`,
    allowed: 'authenticated',
  },
  {
    method: 'post',
    path: `/me/reservations/${RESERVATION}/travelers/${TRAVELER_ROW}/affidavit`,
    allowed: 'authenticated',
  },
  { method: 'get', path: '/me/consents', allowed: 'authenticated' },
  { method: 'post', path: '/me/consents', allowed: 'authenticated' },
  // M5: the traveler's own custom requests and proposals.
  { method: 'post', path: '/me/custom-requests', allowed: 'authenticated' },
  { method: 'get', path: '/me/proposals', allowed: 'authenticated' },
  { method: 'get', path: `/me/proposals/${PROPOSAL}`, allowed: 'authenticated' },
  {
    method: 'get',
    path: `/me/proposals/${PROPOSAL}/versions/${PROPOSAL_VERSION}/pdf`,
    allowed: 'authenticated',
  },
  {
    method: 'post',
    path: `/me/proposals/${PROPOSAL}/accept`,
    allowed: 'authenticated',
  },
  {
    method: 'post',
    path: `/me/proposals/${PROPOSAL}/decline`,
    allowed: 'authenticated',
  },
  // The Booking form: books for the caller, so any signed-in role.
  { method: 'post', path: '/me/reservations/package-booking', allowed: 'authenticated' },
  // M4: the caller's own schedule and proofs of transfer (scoped in the service).
  {
    method: 'get',
    path: `/me/reservations/${RESERVATION}/schedule`,
    allowed: 'authenticated',
  },
  {
    method: 'post',
    path: `/me/reservations/${RESERVATION}/payments/${PAYMENT}/proof`,
    allowed: 'authenticated',
  },

  // M4 payment schedule, proofs and refunds — read by ops roles, changed by writers.
  { method: 'get', path: `/reservations/${RESERVATION}/schedule`, allowed: 'opsRead' },
  {
    method: 'post',
    path: `/reservations/${RESERVATION}/instalments/${INSTALMENT}/extend`,
    allowed: 'opsWrite',
  },
  {
    method: 'get',
    path: `/reservations/${RESERVATION}/refunds/quote`,
    allowed: 'opsRead',
  },
  { method: 'post', path: `/reservations/${RESERVATION}/refunds`, allowed: 'opsWrite' },
  { method: 'get', path: '/payments/proofs', allowed: 'opsRead' },
  { method: 'get', path: `/payments/proofs/${PROOF}/file`, allowed: 'opsRead' },
  { method: 'post', path: `/payments/proofs/${PROOF}/accept`, allowed: 'opsWrite' },
  { method: 'post', path: `/payments/proofs/${PROOF}/reject`, allowed: 'opsWrite' },
  { method: 'get', path: '/refunds', allowed: 'opsRead' },
  // M5 proposal queue: reads by ops roles, pricing by writers.
  { method: 'get', path: '/proposals', allowed: 'opsRead' },
  { method: 'get', path: `/proposals/${PROPOSAL}`, allowed: 'opsRead' },
  {
    method: 'get',
    path: `/proposals/${PROPOSAL}/versions/${PROPOSAL_VERSION}/pdf`,
    allowed: 'opsRead',
  },
  { method: 'post', path: `/proposals/${PROPOSAL}/versions`, allowed: 'opsWrite' },
  { method: 'post', path: `/refunds/${REFUND}/approve`, allowed: 'opsWrite' },
  { method: 'post', path: `/refunds/${REFUND}/reject`, allowed: 'opsWrite' },
  { method: 'post', path: `/refunds/${REFUND}/sent`, allowed: 'opsWrite' },

  // Dispatch / escalation — ops control; worker responds.
  { method: 'post', path: `/reservations/${RESERVATION}/dispatch`, allowed: 'opsWrite' },
  { method: 'get', path: '/dispatch/active', allowed: 'opsRead' },
  { method: 'get', path: `/reservations/${RESERVATION}/dispatch`, allowed: 'opsRead' },
  {
    method: 'get',
    path: `/service-items/${SERVICE_ITEM}/candidates`,
    allowed: 'opsRead',
  },
  {
    method: 'post',
    path: `/service-items/${SERVICE_ITEM}/reassign`,
    allowed: 'opsWrite',
  },
  { method: 'post', path: `/service-items/${SERVICE_ITEM}/accept`, allowed: 'worker' },
  { method: 'post', path: `/service-items/${SERVICE_ITEM}/decline`, allowed: 'worker' },

  // Inventory / CMS / pricing.
  { method: 'get', path: '/inventory', allowed: 'opsRead' },
  { method: 'get', path: `/inventory/${INVENTORY}`, allowed: 'opsRead' },
  { method: 'post', path: '/inventory', allowed: 'opsWrite' },
  { method: 'patch', path: `/inventory/${INVENTORY}`, allowed: 'opsWrite' },
  { method: 'delete', path: `/inventory/${INVENTORY}`, allowed: 'opsWrite' },
  { method: 'get', path: `/inventory/${INVENTORY}/pricing-rules`, allowed: 'opsRead' },
  { method: 'post', path: `/inventory/${INVENTORY}/pricing-rules`, allowed: 'opsWrite' },
  {
    method: 'patch',
    path: `/inventory/${INVENTORY}/pricing-rules/${RULE}`,
    allowed: 'opsWrite',
  },
  {
    method: 'delete',
    path: `/inventory/${INVENTORY}/pricing-rules/${RULE}`,
    allowed: 'opsWrite',
  },
  { method: 'get', path: `/inventory/${INVENTORY}/media`, allowed: 'opsRead' },
  { method: 'post', path: `/inventory/${INVENTORY}/media`, allowed: 'opsWrite' },
  {
    method: 'delete',
    path: `/inventory/${INVENTORY}/media/${MEDIA}`,
    allowed: 'opsWrite',
  },
  { method: 'get', path: `/inventory/${INVENTORY}/price`, allowed: 'opsRead' },

  // Packages.
  { method: 'get', path: '/packages', allowed: 'opsRead' },
  { method: 'get', path: `/packages/${PACKAGE}`, allowed: 'opsRead' },
  { method: 'post', path: '/packages', allowed: 'opsWrite' },
  { method: 'patch', path: `/packages/${PACKAGE}`, allowed: 'opsWrite' },
  { method: 'put', path: `/packages/${PACKAGE}/translations/es`, allowed: 'opsWrite' },
  { method: 'get', path: `/packages/media/${MEDIA}`, allowed: 'opsRead' },
  { method: 'post', path: `/packages/${PACKAGE}/media`, allowed: 'opsWrite' },
  { method: 'delete', path: `/packages/${PACKAGE}/media/${MEDIA}`, allowed: 'opsWrite' },
  { method: 'delete', path: `/packages/${PACKAGE}`, allowed: 'opsWrite' },

  // Suppliers + compliance.
  { method: 'get', path: '/suppliers', allowed: 'opsRead' },
  { method: 'get', path: '/suppliers/expiring', allowed: 'opsRead' },
  { method: 'get', path: `/suppliers/${SUPPLIER}`, allowed: 'opsRead' },
  { method: 'get', path: `/suppliers/${SUPPLIER}/credential`, allowed: 'opsRead' },
  { method: 'post', path: `/suppliers/${SUPPLIER}/credential`, allowed: 'opsRead' },
  { method: 'get', path: `/suppliers/${SUPPLIER}/availability`, allowed: 'opsRead' },
  { method: 'put', path: `/suppliers/${SUPPLIER}/availability`, allowed: 'opsWrite' },
  { method: 'post', path: `/suppliers/${SUPPLIER}/verification`, allowed: 'opsWrite' },

  // Imports, applications, quality.
  { method: 'post', path: '/imports', allowed: 'opsWrite' },
  { method: 'get', path: `/imports/${IMPORT}`, allowed: 'opsRead' },
  { method: 'post', path: `/imports/${IMPORT}/commit`, allowed: 'opsWrite' },
  { method: 'get', path: '/supplier-applications', allowed: 'opsRead' },
  {
    method: 'post',
    path: `/supplier-applications/${APPLICATION}/approve`,
    allowed: 'opsWrite',
  },
  {
    method: 'post',
    path: `/supplier-applications/${APPLICATION}/reject`,
    allowed: 'opsWrite',
  },
  { method: 'get', path: '/incidents', allowed: 'opsRead' },
  { method: 'post', path: `/reservations/${RESERVATION}/incidents`, allowed: 'opsWrite' },
  { method: 'patch', path: `/incidents/${INCIDENT}/resolve`, allowed: 'opsWrite' },
  { method: 'get', path: '/reviews', allowed: 'opsRead' },
  { method: 'get', path: '/quality/supplier-reliability', allowed: 'opsRead' },

  // GDPR retention lifecycle (the keep-alive link itself is public).
  { method: 'get', path: '/retention/pending', allowed: 'opsRead' },
  { method: 'post', path: '/retention/scan', allowed: 'opsWrite' },

  // Customers read model.
  { method: 'get', path: '/customers', allowed: 'opsRead' },
  { method: 'get', path: `/customers/${CUSTOMER}`, allowed: 'opsRead' },
];

const DOCUMENT = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';

const fakePrisma = {
  serviceItem: { findUnique: async () => null },
  // A traveler voucher on a booking the fixture traveler owns.
  document: {
    findUnique: async () => ({
      id: DOCUMENT,
      type: 'VOUCHER',
      storageKey: 'missing/voucher.pdf',
      reservation: { userId: USERS.traveler.id },
    }),
  },
  paymentReceipt: { findFirst: async () => null },
  $queryRaw: async () => [{ '?column?': 1 }],
};

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const email = headers['x-test-user'];
    const user = Object.values(USERS).find((candidate) => candidate.email === email);
    if (!user) return null;
    return {
      user: { id: user.id, email: user.email, role: user.role },
      session: { id: 'session-1', userId: user.id, expiresAt: new Date() },
    };
  },
};

describe('authorization matrix', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function deniedFor(allowed: Allowed): { email: string; label: string }[] {
    if (allowed === 'authenticated') {
      return [];
    }
    if (allowed === 'superAdmin') {
      return [
        { email: USERS.operations.email, label: 'operations admin' },
        { email: USERS.support.email, label: 'support' },
        { email: USERS.worker.email, label: 'service worker' },
        { email: USERS.traveler.email, label: 'traveler' },
      ];
    }
    if (allowed === 'worker') {
      return [
        { email: USERS.operations.email, label: 'operations admin' },
        { email: USERS.support.email, label: 'support' },
        { email: USERS.traveler.email, label: 'traveler' },
      ];
    }
    const denied = [
      { email: USERS.worker.email, label: 'service worker' },
      { email: USERS.traveler.email, label: 'traveler' },
    ];
    if (allowed === 'opsWrite') {
      denied.push({ email: USERS.support.email, label: 'support' });
    }
    return denied;
  }

  it('returns 401 for every protected route without a session', async () => {
    for (const route of ROUTES) {
      const response = await request(app.getHttpServer())[route.method](route.path);
      expect(response.status, `${route.method.toUpperCase()} ${route.path}`).toBe(401);
    }
  });

  it('denies each protected route to every role outside its allow-list', async () => {
    for (const route of ROUTES) {
      for (const { email, label } of deniedFor(route.allowed)) {
        const server = app.getHttpServer();
        const call = request(server)[route.method](route.path);
        const response = await call.set('x-test-user', email);
        expect(
          response.status,
          `${label} → ${route.method.toUpperCase()} ${route.path}`,
        ).toBe(403);
      }
    }
  });

  it('admits a service worker to the worker-only dispatch actions', async () => {
    for (const action of ['accept', 'decline'] as const) {
      const response = await request(app.getHttpServer())
        .post(`/service-items/${SERVICE_ITEM}/${action}`)
        .set('x-test-user', USERS.worker.email)
        .send({ reason: 'not needed' });

      // Past the guard, the service simply cannot find the fixture item.
      expect(response.status, action).toBe(404);
    }
  });

  it('limits document downloads to the booking’s owner and the ops roles', async () => {
    const path = `/documents/${DOCUMENT}/download`;
    expect((await request(app.getHttpServer()).get(path)).status).toBe(401);
    const worker = await request(app.getHttpServer())
      .get(path)
      .set('x-test-user', USERS.worker.email);
    expect(worker.status, 'service worker').toBe(403);

    // Past the check, the fixture file does not exist in storage; what matters
    // is that the owner and every ops role get through it.
    for (const user of [
      USERS.traveler,
      USERS.support,
      USERS.operations,
      USERS.superAdmin,
    ]) {
      const response = await request(app.getHttpServer())
        .get(path)
        .set('x-test-user', user.email);
      expect([401, 403], user.role).not.toContain(response.status);
    }
  });

  it('keeps public endpoints open without a session', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/health/ready')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/tenant/config')).status).toBe(200);
    // The keep-alive link is carried by email, so it is public; an invalid
    // token resolves to a 400 HTML page rather than a 401.
    const keepAlive = await request(app.getHttpServer()).get(
      '/retention/keep-alive?token=invalid',
    );
    expect(keepAlive.status).toBe(400);

    // The wire page's PII-free intent lookup is public; an unknown reference is
    // a 404, not a 401.
    const intent = await request(app.getHttpServer()).get(
      '/payments/intents/unknown-reference',
    );
    expect(intent.status).toBe(404);

    // The Support form is public; an empty body fails validation (400), not auth.
    const contact = await request(app.getHttpServer()).post('/contact').send({});
    expect(contact.status).toBe(400);
  });
});
