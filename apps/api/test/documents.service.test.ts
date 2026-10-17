import { Prisma, type Document } from '@ota/db';
import type { TenantConfig } from '@ota/config';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { DocumentRenderer } from '../src/documents/document-renderer';
import type { DocumentStorage } from '../src/documents/document-storage';
import { DocumentsService } from '../src/documents/documents.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const RESERVATION_ID = 'res-1';

const OPERATOR: AuthUser = {
  id: 'user-ops',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};

const tenantConfig: TenantConfig = {
  tenantId: 'cuba-eco-travel',
  branding: {
    agencyName: 'Authentic Cuba Expeditions',
    licenseNumber: 'MINTUR-TEST-1234',
    primaryColor: '#0f766e',
    supportEmail: null,
    supportPhone: null,
  },
  primaryLocale: 'es',
  supportedLocales: ['es', 'en', 'fr'],
  theme: { palette: 'ecoGreen', borderRadius: 'md' },
  features: {
    interactiveSvgMap: true,
    culturalEventsBanner: true,
    recruitmentPortal: true,
    customItineraryBuilder: true,
    instantBooking: false,
    directBankTransferRail: true,
    creditCardGatewayRail: true,
  },
  destinations: { geographyType: 'cuba_provinces' },
  emergencyContacts: [],
};

const reservation = {
  id: RESERVATION_ID,
  userId: 'user-traveler',
  bookingCode: 'ABC12345',
  startDate: new Date('2026-11-01T00:00:00Z'),
  endDate: new Date('2026-11-05T00:00:00Z'),
  status: 'CONFIRMED',
  totalCurrency: 'EUR',
  totalAmount: '250.00',
  customItineraryPayload: null,
  createdAt: new Date('2026-09-20T10:00:00Z'),
  updatedAt: new Date('2026-09-20T10:00:00Z'),
  user: { id: 'user-traveler', fullName: 'Jane Traveler', email: 'jane@example.test' },
  priceLines: [],
  serviceItems: [
    {
      id: 'item-1',
      reservationId: RESERVATION_ID,
      supplierId: 'sup-1',
      serviceType: 'GUIDE',
      province: 'La Habana',
      serviceDateStart: new Date('2026-11-02T09:00:00Z'),
      serviceDateEnd: new Date('2026-11-02T13:00:00Z'),
      status: 'ACCEPTED',
      dispatchDeadline: null,
      offeredAt: null,
      respondedAt: null,
      declineReason: null,
      payoutRate: '40.00',
      payoutStatus: 'ACCRUED',
      travelerPrice: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      supplier: {
        id: 'sup-1',
        userId: 'user-worker',
        primaryPhone: '+53 5555 1111',
        user: { fullName: 'Guide One' },
      },
    },
  ],
};

describe('DocumentsService', () => {
  let created: Document[];
  let savedKeys: string[];
  const renderer: DocumentRenderer = {
    render: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
  };
  const storage: DocumentStorage = {
    save: vi.fn(async (key: string) => {
      savedKeys.push(key);
    }),
    read: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
  };
  let audits: string[];

  const fakePrisma = () =>
    ({
      // M3: no travelers, so the OFAC gate is clear.
      reservationTraveler: { findMany: async () => [] },
      travelerAffidavit: { findMany: async () => [] },
      reservation: {
        findUnique: async () => reservation,
      },
      document: {
        findMany: async () => created,
        findUnique: async (args: { where: { id: string } }) => {
          const doc = created.find((item) => item.id === args.where.id);
          if (!doc) return null;
          return { ...doc, reservation: { userId: 'user-traveler' } };
        },
        create: async (args: { data: Record<string, unknown> }) => {
          const doc = {
            id: `doc-${created.length + 1}`,
            generatedAt: new Date(),
            createdAt: new Date(),
            ...args.data,
          } as Document;
          created.push(doc);
          return doc;
        },
      },
      auditLog: {
        create: async (args: { data: { action: string } }) => {
          audits.push(args.data.action);
          return args.data;
        },
      },
    }) as unknown as PrismaService;

  beforeEach(() => {
    created = [];
    savedKeys = [];
    audits = [];
  });

  it('generates a voucher, work order, and invoice', async () => {
    const service = new DocumentsService(fakePrisma(), renderer, storage, tenantConfig);

    const documents = await service.generate(RESERVATION_ID, OPERATOR);

    expect(documents.map((document) => document.type)).toEqual([
      'VOUCHER',
      'WORK_ORDER',
      'INVOICE',
    ]);
    expect(savedKeys).toHaveLength(3);
    expect(audits).toContain('documents.generated');
  });

  it('prints the per-service price and the frozen price lines on the invoice', async () => {
    const priced = {
      ...reservation,
      serviceItems: reservation.serviceItems.map((item) => ({
        ...item,
        travelerPrice: new Prisma.Decimal('95'),
      })),
      priceLines: [
        {
          kind: 'FEE',
          label: 'Service fee',
          quantity: new Prisma.Decimal('1'),
          amount: new Prisma.Decimal('100'),
        },
      ],
    };
    const prisma = {
      ...fakePrisma(),
      reservation: { findUnique: async () => priced },
    } as unknown as PrismaService;
    const render = vi.fn(async (_html: string) => new Uint8Array([37, 80, 68, 70]));
    const service = new DocumentsService(prisma, { render }, storage, tenantConfig);

    await service.generate(RESERVATION_ID, OPERATOR);

    const invoice = render.mock.calls.at(-1)![0];
    expect(invoice).toContain('95.00 EUR');
    expect(invoice).toContain('Fee — Service fee');
    expect(invoice).toContain('100.00 EUR');
  });

  it('holds the voucher and work orders while a US traveler has not certified (OFAC)', async () => {
    const prisma = {
      ...fakePrisma(),
      reservationTraveler: {
        findMany: async () => [{ id: 'traveler-us', usPerson: null, nationality: 'US' }],
      },
      travelerAffidavit: { findMany: async () => [] },
    } as unknown as PrismaService;
    const service = new DocumentsService(prisma, renderer, storage, tenantConfig);

    const documents = await service.generate(RESERVATION_ID, OPERATOR);

    expect(documents.map((document) => document.type)).toEqual(['INVOICE']);
    expect(audits).toEqual(['documents.generated', 'documents.held']);
  });

  it('stores documents under the booking code', async () => {
    const service = new DocumentsService(fakePrisma(), renderer, storage, tenantConfig);

    await service.generate(RESERVATION_ID, OPERATOR);

    expect(savedKeys[0]).toBe('ABC12345/voucher-1.pdf');
  });

  it('throws 404 for an unknown reservation', async () => {
    const prisma = {
      reservation: { findUnique: async () => null },
    } as unknown as PrismaService;
    const service = new DocumentsService(prisma, renderer, storage, tenantConfig);

    await expect(service.generate('missing', OPERATOR)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets an operations admin read any stored document', async () => {
    const service = new DocumentsService(fakePrisma(), renderer, storage, tenantConfig);
    await service.generate(RESERVATION_ID, OPERATOR);

    const result = await service.read('doc-1', OPERATOR);

    expect(result.data).toBeInstanceOf(Uint8Array);
  });

  it('forbids a traveler from reading another traveler’s document', async () => {
    const prisma = {
      document: {
        findUnique: async () => ({
          id: 'doc-1',
          storageKey: 'ABC12345/voucher-1.pdf',
          reservation: { userId: 'someone-else' },
        }),
      },
    } as unknown as PrismaService;
    const service = new DocumentsService(prisma, renderer, storage, tenantConfig);
    const traveler: AuthUser = {
      id: 'user-traveler',
      email: 'jane@example.test',
      role: 'TRAVELER',
    };

    await expect(service.read('doc-1', traveler)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
