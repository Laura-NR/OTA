import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  Prisma,
  type Availability,
  type SupplierCredential,
  type SupplierProfile,
  type SupplierResources,
} from '@ota/db';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { withNoSettingsVersion } from './fixtures/operating-settings';

const SUPER_ADMIN = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@example.test',
  role: 'SUPER_ADMIN',
};
const TRAVELER = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'traveler@example.test',
  role: 'TRAVELER',
};

const WORKER = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'driver@example.test',
  role: 'SERVICE_WORKER',
};

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRIVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DAY_MS = 24 * 60 * 60 * 1000;

function makeSupplier(
  overrides: Partial<SupplierProfile> & { id: string },
): SupplierProfile & { user: { email: string; fullName: string | null } } {
  return {
    userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    category: 'TOUR_GUIDE',
    primaryPhone: '+53 5555 0000',
    provincesActive: ['La Habana'],
    vehicleDetails: null,
    rtnLicenseNumber: `RTN-${overrides.id.slice(0, 4)}`,
    credentialDocumentUrl: null,
    credentialExpiresAt: null,
    verificationStatus: 'PENDING_AUDIT',
    isAvailable: true,
    payoutMethod: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    user: { email: 'supplier@example.test', fullName: 'Supplier Name' },
    ...overrides,
  };
}

interface FakeJob {
  supplierId: string;
  serviceDateStart: Date;
  status: string;
  serviceType: string;
  province: string | null;
  reservation: { status: string };
}

/** A finished job as the inspector's payouts read it (W-Earnings). */
interface FakePayoutJob {
  supplierId: string;
  status: string;
  serviceDateEnd: Date;
  payoutRate: Prisma.Decimal;
  payoutStatus: string;
  reservation: { status: string };
}

type StatusFilter = string | { not?: string; in?: string[] } | undefined;

function matchesStatus(status: string, filter: StatusFilter): boolean {
  if (filter === undefined) return true;
  if (typeof filter === 'string') return status === filter;
  if (filter.not !== undefined && status === filter.not) return false;
  if (filter.in !== undefined && !filter.in.includes(status)) return false;
  return true;
}

interface CredentialWhere {
  id?: string | { in: string[] };
  supplierId?: string;
  kind?: string;
  status?: StatusFilter;
}

/** W-Credentials' `supplier_credentials`, in memory. */
function createFakeCredentials(rows: SupplierCredential[]) {
  const matches = (row: SupplierCredential, where: CredentialWhere) =>
    (where.id === undefined ||
      (typeof where.id === 'string'
        ? row.id === where.id
        : where.id.in.includes(row.id))) &&
    (where.supplierId === undefined || row.supplierId === where.supplierId) &&
    (where.kind === undefined || row.kind === where.kind) &&
    matchesStatus(row.status, where.status);
  return {
    findMany: async ({ where }: { where: CredentialWhere }) =>
      rows
        .filter((row) => matches(row, where))
        .map((row) => ({ ...row, reviewedBy: { fullName: 'Ernesto Valdés' } })),
    findFirst: async ({ where }: { where: CredentialWhere }) =>
      rows.find((row) => matches(row, where)) ?? null,
    create: async ({ data }: { data: Partial<SupplierCredential> }) => {
      const now = new Date();
      const row = {
        id: crypto.randomUUID(),
        status: 'PENDING_AUDIT',
        storageKey: null,
        number: null,
        issuer: null,
        issuedOn: null,
        expiresOn: null,
        uploadedAt: now,
        uploadedById: null,
        reviewedAt: null,
        reviewedById: null,
        rejectReason: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      } as SupplierCredential;
      rows.push(row);
      return row;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<SupplierCredential>;
    }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw new Error(`Credential ${where.id} not found`);
      Object.assign(row, data);
      return row;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: CredentialWhere;
      data: Partial<SupplierCredential>;
    }) => {
      const hit = rows.filter((row) => matches(row, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    },
  };
}

function credential(
  overrides: Partial<SupplierCredential> &
    Pick<SupplierCredential, 'supplierId' | 'kind'>,
): SupplierCredential {
  const at = new Date('2026-01-15T10:00:00Z');
  return {
    id: crypto.randomUUID(),
    status: 'VERIFIED',
    storageKey: null,
    number: null,
    issuer: null,
    issuedOn: null,
    expiresOn: new Date('2027-06-12T00:00:00Z'),
    uploadedAt: at,
    uploadedById: null,
    uploadedVia: 'VISIT',
    reviewedAt: at,
    reviewedById: SUPER_ADMIN.id,
    rejectReason: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function createFakePrisma(
  store: Map<string, ReturnType<typeof makeSupplier>>,
  availability: Map<string, Availability>,
  resources: Map<string, SupplierResources> = new Map(),
  jobs: FakeJob[] = [],
  payoutJobs: FakePayoutJob[] = [],
  credentials: SupplierCredential[] = [],
) {
  const availabilityKey = (supplierId: string, date: Date) =>
    `${supplierId}:${date.toISOString()}`;
  const withResources = (row: ReturnType<typeof makeSupplier>) => {
    const own = resources.get(row.id);
    return { ...row, resources: own ? { ...own, confirmedBy: null } : null };
  };

  const fake = {
    serviceItem: {
      findMany: async ({
        where,
      }: {
        where: { supplierId: string | { in: string[] } };
      }) => {
        const { supplierId } = where;
        return typeof supplierId === 'string'
          ? payoutJobs.filter((job) => job.supplierId === supplierId)
          : jobs.filter((job) => supplierId.in.includes(job.supplierId));
      },
    },
    supplierResources: {
      upsert: async ({
        where,
        create,
      }: {
        where: { supplierId: string };
        create: Omit<SupplierResources, 'createdAt' | 'updatedAt'>;
      }) => {
        const row = {
          ...create,
          solarBatteryKwh: create.solarBatteryKwh,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as SupplierResources;
        resources.set(where.supplierId, row);
        return row;
      },
    },
    availability: {
      findMany: async ({
        where,
      }: {
        where?: {
          supplierId?: string;
          isAvailable?: boolean;
          date?: { gte?: Date; lte?: Date };
        };
      }) => {
        let rows = [...availability.values()];
        if (where?.supplierId) {
          rows = rows.filter((row) => row.supplierId === where.supplierId);
        }
        if (where?.isAvailable !== undefined) {
          rows = rows.filter((row) => row.isAvailable === where.isAvailable);
        }
        if (where?.date?.gte) {
          rows = rows.filter((row) => row.date >= where.date!.gte!);
        }
        if (where?.date?.lte) {
          rows = rows.filter((row) => row.date <= where.date!.lte!);
        }
        return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { supplierId_date: { supplierId: string; date: Date } };
        create: Omit<Availability, 'id' | 'createdAt' | 'updatedAt'>;
        update: Pick<Availability, 'isAvailable' | 'blockReason'>;
      }) => {
        const key = availabilityKey(
          where.supplierId_date.supplierId,
          where.supplierId_date.date,
        );
        const existing = availability.get(key);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const created = {
          id: `avail-${availability.size + 1}`,
          blockReason: null,
          ...create,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Availability;
        availability.set(key, created);
        return created;
      },
    },
    supplierProfile: {
      findMany: async ({
        where,
      }: {
        where?: {
          verificationStatus?: string | { not: string };
          provincesActive?: { has: string };
          credentialExpiresAt?: { not: null; lte: Date };
        };
      }) => {
        let rows = [...store.values()];
        const status = where?.verificationStatus;
        if (typeof status === 'string') {
          rows = rows.filter((row) => row.verificationStatus === status);
        } else if (status?.not) {
          rows = rows.filter((row) => row.verificationStatus !== status.not);
        }
        if (where?.provincesActive?.has) {
          const province = where.provincesActive.has;
          rows = rows.filter((row) => row.provincesActive.includes(province));
        }
        if (where?.credentialExpiresAt) {
          const { lte } = where.credentialExpiresAt;
          rows = rows.filter(
            (row) => row.credentialExpiresAt !== null && row.credentialExpiresAt <= lte,
          );
        }
        return rows.map(withResources);
      },
      findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
        const row = where.id
          ? store.get(where.id)
          : [...store.values()].find((candidate) => candidate.userId === where.userId);
        return row ? withResources(row) : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<SupplierProfile>;
      }) => {
        const existing = store.get(where.id);
        if (!existing) {
          throw new Error(`Supplier ${where.id} not found`);
        }
        const updated = { ...existing, ...data } as ReturnType<typeof makeSupplier>;
        store.set(where.id, updated);
        return updated;
      },
    },
    supplierCredential: createFakeCredentials(credentials),
    auditLog: {
      create: vi.fn(async () => ({})),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };

  return fake;
}

const fakeAuthService = {
  getSession: async (headers: Record<string, string | string[] | undefined>) => {
    const email = headers['x-test-user'];
    const user = [SUPER_ADMIN, TRAVELER, WORKER].find(
      (candidate) => candidate.email === email,
    );
    if (!user) {
      return null;
    }
    return {
      user: { id: user.id, email: user.email, role: user.role },
      session: { id: 'session-1', userId: user.id, expiresAt: new Date() },
    };
  },
};

describe('suppliers', () => {
  let app: INestApplication;
  let store: Map<string, ReturnType<typeof makeSupplier>>;
  let availability: Map<string, Availability>;
  let resources: Map<string, SupplierResources>;
  let jobs: FakeJob[];
  let payoutJobs: FakePayoutJob[];
  let credentials: SupplierCredential[];
  let fakePrisma: ReturnType<typeof createFakePrisma>;

  beforeEach(async () => {
    availability = new Map();
    resources = new Map();
    jobs = [];
    payoutJobs = [];
    credentials = [];
    store = new Map([
      [
        GUIDE_ID,
        makeSupplier({
          id: GUIDE_ID,
          verificationStatus: 'VERIFIED',
          provincesActive: ['La Habana', 'Pinar del Río'],
        }),
      ],
      [
        DRIVER_ID,
        makeSupplier({
          id: DRIVER_ID,
          userId: WORKER.id,
          category: 'PRIVATE_DRIVER',
          verificationStatus: 'PENDING_AUDIT',
          provincesActive: ['Matanzas'],
        }),
      ],
    ]);

    fakePrisma = createFakePrisma(
      store,
      availability,
      resources,
      jobs,
      payoutJobs,
      credentials,
    );

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(withNoSettingsVersion(fakePrisma))
      .overrideProvider(AuthService)
      .useValue(fakeAuthService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists suppliers for an operations admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
  });

  it('filters by verification status', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers?status=VERIFIED')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].verificationStatus).toBe('VERIFIED');
  });

  it("shows the worker's payouts on the inspector, as the worker app reads them", async () => {
    const finished = (endsAt: string, rate: string, payoutStatus: string) => ({
      supplierId: DRIVER_ID,
      status: 'ACCEPTED',
      serviceDateEnd: new Date(endsAt),
      payoutRate: new Prisma.Decimal(rate),
      payoutStatus,
      reservation: { status: 'CONFIRMED' },
    });
    const ended = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    payoutJobs.push(
      finished(ended, '90.10', 'ACCRUED'),
      finished(ended, '25.20', 'PROCESSING'),
      finished(ended, '60.00', 'FAILED'),
      { ...finished(ended, '40.00', 'SETTLED'), supplierId: GUIDE_ID },
    );

    const driver = await request(app.getHttpServer())
      .get(`/suppliers/${DRIVER_ID}`)
      .set('x-test-user', SUPER_ADMIN.email);
    const guide = await request(app.getHttpServer())
      .get(`/suppliers/${GUIDE_ID}`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(driver.status).toBe(200);
    expect(driver.body.payouts).toMatchObject({
      currency: 'EUR',
      pending: { amount: '115.30', jobs: 2 },
      issue: { amount: '60.00', jobs: 1 },
      paidThisYear: { amount: '0.00', jobs: 0 },
    });
    expect(guide.body.payouts.pending).toEqual({ amount: '0.00', jobs: 0 });
  });

  it('lets the desk set and clear how a worker is paid, audited (W-Earnings E2)', async () => {
    const set = await request(app.getHttpServer())
      .put(`/suppliers/${DRIVER_ID}/payout-method`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ method: 'BANK_TRANSFER' });

    expect(set.status).toBe(200);
    expect(set.body.payouts.method).toBe('BANK_TRANSFER');
    expect(fakePrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: SUPER_ADMIN.id,
        action: 'supplier.payout_method_set',
        entityId: DRIVER_ID,
        metadata: { previous: null, next: 'BANK_TRANSFER' },
      }),
    });

    const cleared = await request(app.getHttpServer())
      .put(`/suppliers/${DRIVER_ID}/payout-method`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ method: null });
    expect(cleared.body.payouts.method).toBeNull();

    const invalid = await request(app.getHttpServer())
      .put(`/suppliers/${DRIVER_ID}/payout-method`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ method: 'CHEQUE' });
    expect(invalid.status).toBe(400);
  });

  it('returns 404 for an unknown supplier', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers/99999999-9999-4999-8999-999999999999')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(404);
  });

  it('approves a supplier whose required documents are verified, and records an audit entry', async () => {
    for (const kind of [
      'TRANSPORT_LICENCE',
      'TECHNICAL_INSPECTION',
      'LIABILITY_INSURANCE',
      'IDENTITY_CARD',
    ] as const) {
      credentials.push(credential({ supplierId: DRIVER_ID, kind }));
    }

    const response = await request(app.getHttpServer())
      .post(`/suppliers/${DRIVER_ID}/verification`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ status: 'VERIFIED' });

    expect(response.status).toBe(200);
    expect(response.body.verificationStatus).toBe('VERIFIED');
    expect(store.get(DRIVER_ID)?.verificationStatus).toBe('VERIFIED');
    expect(fakePrisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('refuses to approve a supplier while a required document is missing (W-Credentials V3a)', async () => {
    credentials.push(credential({ supplierId: DRIVER_ID, kind: 'TRANSPORT_LICENCE' }));
    credentials.push(
      credential({
        supplierId: DRIVER_ID,
        kind: 'LIABILITY_INSURANCE',
        status: 'PENDING_AUDIT',
      }),
    );

    const response = await request(app.getHttpServer())
      .post(`/suppliers/${DRIVER_ID}/verification`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ status: 'VERIFIED' });

    expect(response.status).toBe(409);
    expect(response.body.message).toContain(
      'TECHNICAL_INSPECTION, LIABILITY_INSURANCE, IDENTITY_CARD',
    );
    expect(store.get(DRIVER_ID)?.verificationStatus).toBe('PENDING_AUDIT');
    expect(fakePrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('still suspends a supplier with missing documents', async () => {
    const response = await request(app.getHttpServer())
      .post(`/suppliers/${GUIDE_ID}/verification`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ status: 'SUSPENDED', reason: 'Licence seized' });

    expect(response.status).toBe(200);
    expect(store.get(GUIDE_ID)?.verificationStatus).toBe('SUSPENDED');
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(403);
  });

  describe('W-Credentials', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString('base64');

    function upload(supplierId: string, kind: string, user = SUPER_ADMIN.email) {
      return request(app.getHttpServer())
        .post(`/suppliers/${supplierId}/credential`)
        .set('x-test-user', user)
        .send({
          kind,
          filename: 'licencia.png',
          contentType: 'image/png',
          contentBase64: png,
          via: 'WHATSAPP',
        });
    }

    it('lists each required document with the version waiting for review, and serves its file audited', async () => {
      const uploaded = await upload(GUIDE_ID, 'GUIDE_LICENCE');

      expect(uploaded.status).toBe(200);
      expect(uploaded.body.slots.map((slot: { kind: string }) => slot.kind)).toEqual([
        'GUIDE_LICENCE',
        'IDENTITY_CARD',
      ]);
      expect(uploaded.body.missing).toEqual(['GUIDE_LICENCE', 'IDENTITY_CARD']);
      const pending = uploaded.body.slots[0].pending;
      expect(pending).toMatchObject({
        status: 'PENDING_AUDIT',
        uploadedVia: 'WHATSAPP',
        hasFile: true,
        contentType: 'image/png',
      });
      expect(uploaded.body.slots[0].state).toBe('MISSING');

      const file = await request(app.getHttpServer())
        .get(`/suppliers/${GUIDE_ID}/credentials/${pending.id}/file`)
        .set('x-test-user', SUPER_ADMIN.email);

      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toContain('image/png');
      expect(fakePrisma.auditLog.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({
          action: 'supplier.credential_viewed',
          entityId: GUIDE_ID,
          metadata: { credentialId: pending.id, kind: 'GUIDE_LICENCE' },
        }),
      });
    });

    it('returns 404 for a version with no file kept', async () => {
      const row = credential({ supplierId: GUIDE_ID, kind: 'IDENTITY_CARD' });
      credentials.push(row);

      const response = await request(app.getHttpServer())
        .get(`/suppliers/${GUIDE_ID}/credentials/${row.id}/file`)
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.status).toBe(404);
    });

    it('approves a renewal: the old version is superseded and the expiry dispatch reads is the earliest current one', async () => {
      credentials.push(
        credential({
          supplierId: DRIVER_ID,
          kind: 'TRANSPORT_LICENCE',
          expiresOn: new Date('2026-12-01T00:00:00Z'),
        }),
        credential({
          supplierId: DRIVER_ID,
          kind: 'LIABILITY_INSURANCE',
          expiresOn: new Date('2027-01-31T00:00:00Z'),
        }),
      );
      const uploaded = await upload(DRIVER_ID, 'TRANSPORT_LICENCE');
      const pendingId = uploaded.body.slots[0].pending.id;
      const future = new Date(Date.now() + 800 * DAY_MS).toISOString().slice(0, 10);

      const approved = await request(app.getHttpServer())
        .post(`/suppliers/${DRIVER_ID}/credentials/${pendingId}/approve`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({
          number: 'LOT-MTZ-2026-00042',
          issuedOn: '2026-01-10',
          expiresOn: future,
        });

      expect(approved.status).toBe(200);
      expect(approved.body.slots[0].current).toMatchObject({
        id: pendingId,
        number: 'LOT-MTZ-2026-00042',
        expiresOn: future,
        reviewedByName: 'Ernesto',
      });
      expect(approved.body.slots[0].pending).toBeNull();
      expect(
        credentials.filter(
          (row) => row.kind === 'TRANSPORT_LICENCE' && row.status === 'SUPERSEDED',
        ),
      ).toHaveLength(1);
      expect(store.get(DRIVER_ID)?.credentialExpiresAt).toEqual(
        new Date('2027-01-31T00:00:00Z'),
      );
      expect(fakePrisma.auditLog.create).toHaveBeenLastCalledWith({
        data: expect.objectContaining({ action: 'supplier.credential_approved' }),
      });

      const again = await request(app.getHttpServer())
        .post(`/suppliers/${DRIVER_ID}/credentials/${pendingId}/approve`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ expiresOn: future });
      expect(again.status).toBe(409);
    });

    it('needs the expiry read off the document to approve it', async () => {
      const uploaded = await upload(GUIDE_ID, 'GUIDE_LICENCE');

      const response = await request(app.getHttpServer())
        .post(
          `/suppliers/${GUIDE_ID}/credentials/${uploaded.body.slots[0].pending.id}/approve`,
        )
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ number: 'FMT-001' });

      expect(response.status).toBe(422);
      expect(credentials[0]?.status).toBe('PENDING_AUDIT');
    });

    it('rejects an upload with a reason the worker sees, and removes its file', async () => {
      const uploaded = await upload(GUIDE_ID, 'GUIDE_LICENCE');
      const pendingId = uploaded.body.slots[0].pending.id;

      const rejected = await request(app.getHttpServer())
        .post(`/suppliers/${GUIDE_ID}/credentials/${pendingId}/reject`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ reason: 'Hay un reflejo sobre el número; repite la foto.' });

      expect(rejected.status).toBe(200);
      expect(rejected.body.slots[0].rejected).toMatchObject({
        id: pendingId,
        rejectReason: 'Hay un reflejo sobre el número; repite la foto.',
        hasFile: false,
      });
      expect(rejected.body.slots[0].pending).toBeNull();
    });

    it('keeps one upload waiting per document: a new one replaces it', async () => {
      await upload(GUIDE_ID, 'GUIDE_LICENCE');
      const second = await upload(GUIDE_ID, 'GUIDE_LICENCE');

      expect(credentials.filter((row) => row.status === 'PENDING_AUDIT')).toHaveLength(1);
      expect(second.body.slots[0].pending.id).toBe(
        credentials.find((row) => row.status === 'PENDING_AUDIT')?.id,
      );
    });

    it('refuses a photo of the identity card and a document the category does not need', async () => {
      expect((await upload(GUIDE_ID, 'IDENTITY_CARD')).status).toBe(422);
      expect((await upload(GUIDE_ID, 'TRANSPORT_LICENCE')).status).toBe(422);
      expect(credentials).toHaveLength(0);
    });

    it('records the identity card checked in person, with no file', async () => {
      const response = await request(app.getHttpServer())
        .post(`/suppliers/${GUIDE_ID}/credentials/identity-card`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ via: 'VISIT' });

      expect(response.status).toBe(200);
      expect(response.body.slots[1]).toMatchObject({
        kind: 'IDENTITY_CARD',
        state: 'VALID',
        current: { status: 'VERIFIED', hasFile: false, uploadedVia: 'VISIT' },
      });
      expect(response.body.missing).toEqual(['GUIDE_LICENCE']);
    });

    it('shows the worker their documents and takes their photo as a WORKER_APP upload', async () => {
      credentials.push(
        credential({
          supplierId: DRIVER_ID,
          kind: 'TECHNICAL_INSPECTION',
          expiresOn: new Date(Date.now() + 10 * DAY_MS),
        }),
      );
      store.set(DRIVER_ID, { ...store.get(DRIVER_ID)!, verificationStatus: 'VERIFIED' });

      const listed = await request(app.getHttpServer())
        .get('/worker/credentials')
        .set('x-test-user', WORKER.email);

      expect(listed.status).toBe(200);
      expect(listed.body.summary).toMatchObject({ state: 'EXPIRING', autoOffers: false });
      expect(listed.body.summary.nextExpiry.kind).toBe('TECHNICAL_INSPECTION');
      expect(listed.body.slots).toHaveLength(4);

      const uploaded = await request(app.getHttpServer())
        .post('/worker/credentials')
        .set('x-test-user', WORKER.email)
        .send({
          kind: 'TECHNICAL_INSPECTION',
          filename: 'somaton.jpg',
          contentType: 'image/jpeg',
          contentBase64: png,
        });

      expect(uploaded.status).toBe(200);
      expect(uploaded.body.summary.state).toBe('IN_REVIEW');
      expect(uploaded.body.slots[1].pending).toMatchObject({
        uploadedVia: 'WORKER_APP',
        contentType: 'image/jpeg',
      });
      expect(credentials.at(-1)).toMatchObject({
        supplierId: DRIVER_ID,
        uploadedById: WORKER.id,
      });
    });
  });

  it('flags suppliers whose credential is within the expiry window', async () => {
    store.set(
      GUIDE_ID,
      makeSupplier({
        id: GUIDE_ID,
        verificationStatus: 'VERIFIED',
        credentialDocumentUrl: 'credentials/x.jpg',
        credentialExpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/suppliers/expiring?days=30')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(200);
    expect(response.body.map((row: { id: string }) => row.id)).toContain(GUIDE_ID);
  });

  it('returns 403 when a traveler uploads a credential', async () => {
    const response = await request(app.getHttpServer())
      .post(`/suppliers/${GUIDE_ID}/credential`)
      .set('x-test-user', TRAVELER.email)
      .send({ filename: 'x.png', contentType: 'image/png', contentBase64: 'AAAA' });

    expect(response.status).toBe(403);
  });

  it('returns 400 for an unknown verification status', async () => {
    const response = await request(app.getHttpServer())
      .post(`/suppliers/${DRIVER_ID}/verification`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ status: 'MADE_UP' });

    expect(response.status).toBe(400);
  });

  it('sets and lists a supplier availability day', async () => {
    const set = await request(app.getHttpServer())
      .put(`/suppliers/${GUIDE_ID}/availability`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ date: '2027-02-01', isAvailable: false });

    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({
      supplierId: GUIDE_ID,
      date: '2027-02-01',
      isAvailable: false,
    });

    const list = await request(app.getHttpServer())
      .get(`/suppliers/${GUIDE_ID}/availability?from=2027-02-01&to=2027-02-28`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].isAvailable).toBe(false);
  });

  it('updates an existing availability day instead of duplicating it', async () => {
    await request(app.getHttpServer())
      .put(`/suppliers/${GUIDE_ID}/availability`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ date: '2027-02-01', isAvailable: false });
    await request(app.getHttpServer())
      .put(`/suppliers/${GUIDE_ID}/availability`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ date: '2027-02-01', isAvailable: true });

    const list = await request(app.getHttpServer())
      .get(`/suppliers/${GUIDE_ID}/availability`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(list.body).toHaveLength(1);
    expect(list.body[0].isAvailable).toBe(true);
  });

  it('lists the reason a worker gave for a blocked day, and drops it when the desk sets the day (K4)', async () => {
    const date = new Date('2027-02-03T00:00:00Z');
    availability.set(`${GUIDE_ID}:${date.toISOString()}`, {
      id: 'avail-worker',
      supplierId: GUIDE_ID,
      date,
      isAvailable: false,
      blockReason: 'VEHICLE_REPAIR',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const list = async () =>
      (
        await request(app.getHttpServer())
          .get(`/suppliers/${GUIDE_ID}/availability?from=2027-02-01&to=2027-02-28`)
          .set('x-test-user', SUPER_ADMIN.email)
      ).body;

    expect(await list()).toEqual([
      expect.objectContaining({
        date: '2027-02-03',
        isAvailable: false,
        blockReason: 'VEHICLE_REPAIR',
      }),
    ]);

    const set = await request(app.getHttpServer())
      .put(`/suppliers/${GUIDE_ID}/availability`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ date: '2027-02-03', isAvailable: false });
    expect(set.body).toMatchObject({ isAvailable: false, blockReason: null });
    expect((await list())[0].blockReason).toBeNull();
  });

  it('returns 403 when a traveler sets availability', async () => {
    const response = await request(app.getHttpServer())
      .put(`/suppliers/${GUIDE_ID}/availability`)
      .set('x-test-user', TRAVELER.email)
      .send({ date: '2027-02-01', isAvailable: false });

    expect(response.status).toBe(403);
  });

  it('returns 404 when setting availability for an unknown supplier', async () => {
    const response = await request(app.getHttpServer())
      .put('/suppliers/99999999-9999-4999-8999-999999999999/availability')
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ date: '2027-02-01', isAvailable: true });

    expect(response.status).toBe(404);
  });

  it('shows the inspector a block of more than fourteen days in a row ahead (W-Calendar)', async () => {
    const block = (from: string, days: number, isAvailable = false) => {
      for (let index = 0; index < days; index += 1) {
        const date = new Date(Date.parse(`${from}T00:00:00Z`) + index * 86_400_000);
        availability.set(`${GUIDE_ID}:${date.toISOString()}`, {
          id: `avail-${availability.size + 1}`,
          supplierId: GUIDE_ID,
          date,
          isAvailable,
          blockReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    };
    const inspect = async () =>
      (
        await request(app.getHttpServer())
          .get(`/suppliers/${GUIDE_ID}`)
          .set('x-test-user', SUPER_ADMIN.email)
      ).body.longBlock;

    // Fourteen blocked, a day freed, fourteen more: no run is long enough.
    block('2099-03-01', 14);
    block('2099-03-15', 1, true);
    block('2099-03-16', 14);
    expect(await inspect()).toBeNull();

    block('2099-03-15', 1);
    expect(await inspect()).toEqual({ from: '2099-03-01', to: '2099-03-29', days: 29 });
  });

  describe('M6 resources', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;

    function confirmed(
      supplierId: string,
      overrides: Partial<SupplierResources> = {},
    ): SupplierResources {
      return {
        supplierId,
        generator: null,
        generatorHoursPerDay: null,
        generatorSchedule: null,
        generatorFuelDays: null,
        solarBatteryKwh: null,
        waterTankLitres: null,
        rooms: null,
        guestCapacity: null,
        fuelReserveLitres: null,
        confirmedAt: new Date(),
        confirmedById: null,
        confirmedVia: 'PHONE',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    it('shows the Power and Last job columns on the register', async () => {
      resources.set(DRIVER_ID, confirmed(DRIVER_ID, { fuelReserveLitres: 40 }));
      jobs.push(
        {
          supplierId: DRIVER_ID,
          serviceDateStart: new Date(Date.now() - 3 * DAY_MS),
          status: 'ACCEPTED',
          serviceType: 'TRANSPORTATION',
          province: 'Matanzas',
          reservation: { status: 'CONFIRMED' },
        },
        {
          supplierId: DRIVER_ID,
          serviceDateStart: new Date(Date.now() - DAY_MS),
          status: 'DECLINED',
          serviceType: 'TRANSPORTATION',
          province: 'La Habana',
          reservation: { status: 'CONFIRMED' },
        },
      );

      const response = await request(app.getHttpServer())
        .get('/suppliers')
        .set('x-test-user', SUPER_ADMIN.email);

      const driver = response.body.find((row: { id: string }) => row.id === DRIVER_ID);
      expect(driver.power).toMatchObject({ kind: 'FUEL', litres: 40, backup: true });
      expect(driver.lastJob).toMatchObject({
        serviceType: 'TRANSPORTATION',
        province: 'Matanzas',
      });
      const guide = response.body.find((row: { id: string }) => row.id === GUIDE_ID);
      expect(guide.power.kind).toBe('NOT_APPLICABLE');
      expect(guide.lastJob).toBeNull();
    });

    it('keeps only suppliers with backup power under backupPower=1', async () => {
      resources.set(DRIVER_ID, confirmed(DRIVER_ID, { fuelReserveLitres: 40 }));

      const response = await request(app.getHttpServer())
        .get('/suppliers?backupPower=1')
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.body.map((row: { id: string }) => row.id)).toEqual([DRIVER_ID]);
    });

    it('marks a confirmation older than seven days stale', async () => {
      resources.set(
        DRIVER_ID,
        confirmed(DRIVER_ID, {
          fuelReserveLitres: 40,
          confirmedAt: new Date(Date.now() - 8 * DAY_MS),
        }),
      );

      const response = await request(app.getHttpServer())
        .get(`/suppliers/${DRIVER_ID}`)
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.body.resources.stale).toBe(true);
      expect(response.body.power.stale).toBe(true);
    });

    it('confirms a driver fuel reserve with the actor and channel and audits both values', async () => {
      resources.set(DRIVER_ID, confirmed(DRIVER_ID, { fuelReserveLitres: 60 }));

      const response = await request(app.getHttpServer())
        .put(`/suppliers/${DRIVER_ID}/resources`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ via: 'WHATSAPP', fuelReserveLitres: 40 });

      expect(response.status).toBe(200);
      expect(response.body.resources).toMatchObject({
        fuelReserveLitres: 40,
        confirmedVia: 'WHATSAPP',
        stale: false,
      });
      expect(response.body.jobs12m).toBe(0);
      expect(resources.get(DRIVER_ID)?.confirmedById).toBe(SUPER_ADMIN.id);
      expect(fakePrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'supplier.resources_confirmed',
          entityId: DRIVER_ID,
          metadata: expect.objectContaining({
            via: 'WHATSAPP',
            previous: expect.objectContaining({ fuelReserveLitres: 60 }),
            next: expect.objectContaining({ fuelReserveLitres: 40 }),
          }),
        }),
      });
    });

    it('refuses casa fields on a driver and any resources on a guide', async () => {
      const driver = await request(app.getHttpServer())
        .put(`/suppliers/${DRIVER_ID}/resources`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ via: 'PHONE', fuelReserveLitres: 40, rooms: 2 });
      const guide = await request(app.getHttpServer())
        .put(`/suppliers/${GUIDE_ID}/resources`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ via: 'PHONE', fuelReserveLitres: 40 });

      expect(driver.status).toBe(422);
      expect(guide.status).toBe(422);
      expect(resources.size).toBe(0);
      expect(fakePrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('refuses the worker app channel and out-of-range hours with 400', async () => {
      const channel = await request(app.getHttpServer())
        .put(`/suppliers/${DRIVER_ID}/resources`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ via: 'WORKER_APP', fuelReserveLitres: 40 });
      const hours = await request(app.getHttpServer())
        .put(`/suppliers/${DRIVER_ID}/resources`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ via: 'PHONE', generatorHoursPerDay: 30 });

      expect(channel.status).toBe(400);
      expect(hours.status).toBe(400);
    });
  });

  describe('M6 D7(b) vehicle', () => {
    const vehicle = {
      model: 'Peugeot 5008',
      seats: 7,
      airConditioning: true,
      extras: 'Child seat on request',
      plate: 'P 207 913',
      insurance: 'Civil liability',
      insuranceUntil: '2027-01-31',
      routes: ['HAV ⇄ Viñales', 'Zapata'],
    };

    it('stores a driver vehicle, returns it on the inspector and audits both values', async () => {
      const response = await request(app.getHttpServer())
        .put(`/suppliers/${DRIVER_ID}/vehicle`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send(vehicle);

      expect(response.status).toBe(200);
      expect(response.body.vehicle).toEqual(vehicle);
      expect(store.get(DRIVER_ID)?.vehicleDetails).toEqual(vehicle);
      expect(fakePrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'supplier.vehicle_updated',
          entityId: DRIVER_ID,
          metadata: { previous: null, next: vehicle },
        }),
      });
    });

    it('refuses a vehicle on a guide and an invalid body', async () => {
      const guide = await request(app.getHttpServer())
        .put(`/suppliers/${GUIDE_ID}/vehicle`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send(vehicle);
      const invalid = await request(app.getHttpServer())
        .put(`/suppliers/${DRIVER_ID}/vehicle`)
        .set('x-test-user', SUPER_ADMIN.email)
        .send({ ...vehicle, seats: 0 });

      expect(guide.status).toBe(422);
      expect(invalid.status).toBe(400);
      expect(fakePrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('reads a stored value that does not match the shape as no vehicle', async () => {
      store.set(DRIVER_ID, {
        ...store.get(DRIVER_ID)!,
        vehicleDetails: { legacy: true },
      });

      const response = await request(app.getHttpServer())
        .get(`/suppliers/${DRIVER_ID}`)
        .set('x-test-user', SUPER_ADMIN.email);

      expect(response.body.vehicle).toBeNull();
    });
  });
});
