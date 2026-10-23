import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Availability, SupplierProfile, SupplierResources } from '@ota/db';
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

const GUIDE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DRIVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

function createFakePrisma(
  store: Map<string, ReturnType<typeof makeSupplier>>,
  availability: Map<string, Availability>,
  resources: Map<string, SupplierResources> = new Map(),
  jobs: FakeJob[] = [],
) {
  const availabilityKey = (supplierId: string, date: Date) =>
    `${supplierId}:${date.toISOString()}`;
  const withResources = (row: ReturnType<typeof makeSupplier>) => {
    const own = resources.get(row.id);
    return { ...row, resources: own ? { ...own, confirmedBy: null } : null };
  };

  const fake = {
    serviceItem: {
      findMany: async ({ where }: { where: { supplierId: { in: string[] } } }) =>
        jobs.filter((job) => where.supplierId.in.includes(job.supplierId)),
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
        where?: { supplierId?: string; date?: { gte?: Date; lte?: Date } };
      }) => {
        let rows = [...availability.values()];
        if (where?.supplierId) {
          rows = rows.filter((row) => row.supplierId === where.supplierId);
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
        update: { isAvailable: boolean };
      }) => {
        const key = availabilityKey(
          where.supplierId_date.supplierId,
          where.supplierId_date.date,
        );
        const existing = availability.get(key);
        if (existing) {
          existing.isAvailable = update.isAvailable;
          return existing;
        }
        const created = {
          id: `avail-${availability.size + 1}`,
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
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = store.get(where.id);
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
    const user = [SUPER_ADMIN, TRAVELER].find((candidate) => candidate.email === email);
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
  let fakePrisma: ReturnType<typeof createFakePrisma>;

  beforeEach(async () => {
    availability = new Map();
    resources = new Map();
    jobs = [];
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
          category: 'PRIVATE_DRIVER',
          verificationStatus: 'PENDING_AUDIT',
          provincesActive: ['Matanzas'],
        }),
      ],
    ]);

    fakePrisma = createFakePrisma(store, availability, resources, jobs);

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

  it('returns 404 for an unknown supplier', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers/99999999-9999-4999-8999-999999999999')
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(404);
  });

  it('approves a supplier and records an audit entry', async () => {
    const response = await request(app.getHttpServer())
      .post(`/suppliers/${DRIVER_ID}/verification`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ status: 'VERIFIED' });

    expect(response.status).toBe(200);
    expect(response.body.verificationStatus).toBe('VERIFIED');
    expect(store.get(DRIVER_ID)?.verificationStatus).toBe('VERIFIED');
    expect(fakePrisma.auditLog.create).toHaveBeenCalledOnce();
  });

  it('returns 403 for a traveler', async () => {
    const response = await request(app.getHttpServer())
      .get('/suppliers')
      .set('x-test-user', TRAVELER.email);

    expect(response.status).toBe(403);
  });

  it('uploads a credential and serves it back to the inspector', async () => {
    const contentBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString(
      'base64',
    );

    const upload = await request(app.getHttpServer())
      .post(`/suppliers/${GUIDE_ID}/credential`)
      .set('x-test-user', SUPER_ADMIN.email)
      .send({ filename: 'formatur.png', contentType: 'image/png', contentBase64 });

    expect(upload.status).toBe(200);
    expect(upload.body.hasCredential).toBe(true);
    expect(upload.body.credentialContentType).toBe('image/png');

    const download = await request(app.getHttpServer())
      .get(`/suppliers/${GUIDE_ID}/credential`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('image/png');
  });

  it('returns 404 when no credential is on file', async () => {
    const response = await request(app.getHttpServer())
      .get(`/suppliers/${GUIDE_ID}/credential`)
      .set('x-test-user', SUPER_ADMIN.email);

    expect(response.status).toBe(404);
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
