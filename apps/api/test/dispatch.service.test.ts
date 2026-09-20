import type { DispatchOffer, Reservation, ServiceItem, SupplierProfile } from '@ota/db';
import {
  InvalidReservationTransitionError,
  ReservationStatus,
  ServiceItemStatus,
} from '@ota/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type {
  DispatchScheduler,
  DispatchTimeoutHandler,
} from '../src/dispatch/dispatch.scheduler';
import { DispatchService } from '../src/dispatch/dispatch.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const RESERVATION_ID = 'res-1';
const ITEM_ID = 'item-1';
const GUIDE_ONE = 'sup-1';
const GUIDE_TWO = 'sup-2';
const TRAVELER_ID = 'user-traveler';
const WORKER_USER_ID = 'user-worker-1';

const OPERATOR: AuthUser = {
  id: 'user-ops',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};

function makeReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: RESERVATION_ID,
    userId: TRAVELER_ID,
    bookingCode: 'ABC12345',
    startDate: new Date('2026-11-01T00:00:00Z'),
    endDate: new Date('2026-11-05T00:00:00Z'),
    status: ReservationStatus.ItinerarySubmitted,
    totalCurrency: 'EUR',
    totalAmount: '250' as unknown as Reservation['totalAmount'],
    customItineraryPayload: null,
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

function makeServiceItem(overrides: Partial<ServiceItem> = {}): ServiceItem {
  return {
    id: ITEM_ID,
    reservationId: RESERVATION_ID,
    supplierId: null,
    serviceType: 'GUIDE',
    serviceDateStart: new Date('2026-11-02T09:00:00Z'),
    serviceDateEnd: new Date('2026-11-02T13:00:00Z'),
    status: ServiceItemStatus.Unassigned,
    dispatchDeadline: null,
    offeredAt: null,
    respondedAt: null,
    declineReason: null,
    payoutRate: '0' as unknown as ServiceItem['payoutRate'],
    payoutStatus: 'ACCRUED',
    createdAt: new Date('2026-09-20T10:00:00Z'),
    updatedAt: new Date('2026-09-20T10:00:00Z'),
    ...overrides,
  };
}

function makeSupplier(
  overrides: Partial<SupplierProfile> & { id: string },
): SupplierProfile {
  return {
    userId: WORKER_USER_ID,
    category: 'TOUR_GUIDE',
    primaryPhone: '+53 5555 0000',
    provincesActive: ['La Habana'],
    vehicleDetails: null,
    rtnLicenseNumber: `RTN-${overrides.id}`,
    credentialDocumentUrl: null,
    credentialExpiresAt: new Date('2027-12-31T00:00:00Z'),
    verificationStatus: 'VERIFIED',
    isAvailable: true,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  };
}

class FakeScheduler implements DispatchScheduler {
  handler?: DispatchTimeoutHandler;
  scheduled: { id: string; delayMs: number }[] = [];
  cancelled: string[] = [];

  setTimeoutHandler(handler: DispatchTimeoutHandler): void {
    this.handler = handler;
  }

  async scheduleTimeout(serviceItemId: string, delayMs: number): Promise<void> {
    this.scheduled.push({ id: serviceItemId, delayMs });
  }

  async cancelTimeout(serviceItemId: string): Promise<void> {
    this.cancelled.push(serviceItemId);
  }
}

interface Store {
  reservations: Reservation[];
  serviceItems: ServiceItem[];
  suppliers: SupplierProfile[];
  offers: DispatchOffer[];
  audits: { action: string }[];
}

// Minimal in-memory stand-in for the Prisma models the dispatch engine touches.
function createFakePrisma(store: Store) {
  const fake = {
    reservation: {
      findUnique: async (args: {
        where: { id: string };
        include?: { serviceItems?: boolean };
      }) => {
        const reservation = store.reservations.find((r) => r.id === args.where.id);
        if (!reservation) return null;
        if (args.include?.serviceItems) {
          return {
            ...reservation,
            serviceItems: store.serviceItems.filter(
              (item) => item.reservationId === reservation.id,
            ),
          };
        }
        return reservation;
      },
      update: async (args: { where: { id: string }; data: Partial<Reservation> }) => {
        const reservation = store.reservations.find((r) => r.id === args.where.id);
        if (!reservation) throw new Error('reservation not found');
        Object.assign(reservation, args.data);
        return reservation;
      },
    },
    serviceItem: {
      findUnique: async (args: {
        where: { id: string };
        include?: { supplier?: boolean };
      }) => {
        const item = store.serviceItems.find((i) => i.id === args.where.id);
        if (!item) return null;
        if (args.include?.supplier) {
          return {
            ...item,
            supplier: store.suppliers.find((s) => s.id === item.supplierId) ?? null,
          };
        }
        return item;
      },
      update: async (args: { where: { id: string }; data: Partial<ServiceItem> }) => {
        const item = store.serviceItems.find((i) => i.id === args.where.id);
        if (!item) throw new Error('service item not found');
        Object.assign(item, args.data);
        return item;
      },
    },
    supplierProfile: {
      findUnique: async (args: { where: { id: string } }) =>
        store.suppliers.find((s) => s.id === args.where.id) ?? null,
      findMany: async (args: {
        where?: {
          category?: { in?: string[] };
          isAvailable?: boolean;
          verificationStatus?: string;
        };
      }) => {
        let rows = [...store.suppliers];
        const where = args.where;
        if (where?.category?.in) {
          const list = where.category.in;
          rows = rows.filter((s) => list.includes(s.category));
        }
        if (where?.isAvailable !== undefined) {
          rows = rows.filter((s) => s.isAvailable === where.isAvailable);
        }
        if (where?.verificationStatus) {
          rows = rows.filter((s) => s.verificationStatus === where.verificationStatus);
        }
        return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      },
    },
    dispatchOffer: {
      findMany: async (args: { where: { serviceItemId: string } }) =>
        store.offers
          .filter((o) => o.serviceItemId === args.where.serviceItemId)
          .map((o) => ({ supplierId: o.supplierId })),
      create: async (args: { data: Partial<DispatchOffer> }) => {
        const offer = {
          id: `offer-${store.offers.length + 1}`,
          status: 'OFFERED',
          respondedAt: null,
          declineReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...args.data,
        } as DispatchOffer;
        store.offers.push(offer);
        return offer;
      },
      updateMany: async (args: {
        where: { serviceItemId: string; status: string };
        data: Partial<DispatchOffer>;
      }) => {
        let count = 0;
        for (const offer of store.offers) {
          if (
            offer.serviceItemId === args.where.serviceItemId &&
            offer.status === args.where.status
          ) {
            Object.assign(offer, args.data);
            count += 1;
          }
        }
        return { count };
      },
    },
    auditLog: {
      create: async (args: { data: { action: string } }) => {
        store.audits.push({ action: args.data.action });
        return args.data;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(fake),
  };

  return fake as unknown as PrismaService;
}

describe('DispatchService', () => {
  let store: Store;
  let scheduler: FakeScheduler;
  let service: DispatchService;

  beforeEach(() => {
    store = {
      reservations: [makeReservation()],
      serviceItems: [makeServiceItem()],
      suppliers: [makeSupplier({ id: GUIDE_ONE })],
      offers: [],
      audits: [],
    };
    scheduler = new FakeScheduler();
    service = new DispatchService(createFakePrisma(store), scheduler);
    service.onModuleInit();
  });

  it('offers an unassigned item and schedules a timeout', async () => {
    const view = await service.startDispatch(RESERVATION_ID, OPERATOR);

    expect(store.reservations[0]?.status).toBe(ReservationStatus.DispatchInProgress);
    expect(view.serviceItems[0]?.status).toBe(ServiceItemStatus.Offered);
    expect(view.serviceItems[0]?.supplierId).toBe(GUIDE_ONE);
    expect(store.offers).toHaveLength(1);
    expect(scheduler.scheduled).toEqual([
      { id: ITEM_ID, delayMs: expect.any(Number) as number },
    ]);
  });

  it('flags the reservation when no supplier is eligible', async () => {
    store.suppliers = [
      makeSupplier({ id: GUIDE_ONE, verificationStatus: 'PENDING_AUDIT' }),
    ];

    await service.startDispatch(RESERVATION_ID, OPERATOR);

    expect(store.reservations[0]?.status).toBe(ReservationStatus.ActionRequired);
    expect(store.serviceItems[0]?.status).toBe(ServiceItemStatus.Unassigned);
    expect(scheduler.scheduled).toHaveLength(0);
  });

  it('advances the reservation once every item is accepted', async () => {
    await service.startDispatch(RESERVATION_ID, OPERATOR);

    const worker: AuthUser = {
      id: WORKER_USER_ID,
      email: 'guide@example.test',
      role: 'SERVICE_WORKER',
    };
    await service.accept(ITEM_ID, worker);

    expect(store.serviceItems[0]?.status).toBe(ServiceItemStatus.Accepted);
    expect(store.reservations[0]?.status).toBe(ReservationStatus.AssemblyAndEscalation);
    expect(scheduler.cancelled).toContain(ITEM_ID);
  });

  it('flags the reservation on decline and cancels the timer', async () => {
    await service.startDispatch(RESERVATION_ID, OPERATOR);

    const worker: AuthUser = {
      id: WORKER_USER_ID,
      email: 'guide@example.test',
      role: 'SERVICE_WORKER',
    };
    await service.decline(ITEM_ID, 'unavailable', worker);

    expect(store.serviceItems[0]?.status).toBe(ServiceItemStatus.Declined);
    expect(store.reservations[0]?.status).toBe(ReservationStatus.ActionRequired);
    expect(scheduler.cancelled).toContain(ITEM_ID);
  });

  it('times out an unanswered offer and flags the reservation', async () => {
    await service.startDispatch(RESERVATION_ID, OPERATOR);

    await service.handleTimeout(ITEM_ID);

    expect(store.serviceItems[0]?.status).toBe(ServiceItemStatus.Timeout);
    expect(store.reservations[0]?.status).toBe(ReservationStatus.ActionRequired);
  });

  it('reassigns to a different eligible supplier', async () => {
    store.suppliers = [
      makeSupplier({ id: GUIDE_ONE }),
      makeSupplier({ id: GUIDE_TWO, userId: 'user-worker-2' }),
    ];
    await service.startDispatch(RESERVATION_ID, OPERATOR);

    const view = await service.reassign(ITEM_ID, {}, OPERATOR);

    expect(view.serviceItems[0]?.supplierId).toBe(GUIDE_TWO);
    expect(store.offers).toHaveLength(2);
  });

  it('rejects dispatch from a terminal reservation', async () => {
    store.reservations[0]!.status = ReservationStatus.Completed;

    await expect(service.startDispatch(RESERVATION_ID, OPERATOR)).rejects.toBeInstanceOf(
      InvalidReservationTransitionError,
    );
  });
});
