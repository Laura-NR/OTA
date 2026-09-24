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

type Allowed = 'opsRead' | 'opsWrite' | 'worker';
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
];

const fakePrisma = {
  serviceItem: { findUnique: async () => null },
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

  it('keeps public endpoints open without a session', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/tenant/config')).status).toBe(200);
  });
});
