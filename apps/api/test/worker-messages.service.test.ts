import {
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { EmailMessage, Mailer } from '@ota/email';
import { describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { EscalationPublisher } from '../src/escalation/escalation.publisher';
import type { PrismaService } from '../src/prisma/prisma.service';
import { WorkerMessagesService } from '../src/worker-messages/worker-messages.service';

const WORKER: AuthUser = {
  id: 'u-reinier',
  email: 'driver@example.test',
  role: 'SERVICE_WORKER',
  sessionId: 'session-1',
};
const DESK: AuthUser = {
  id: 'u-ana',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};
const NOW = new Date('2026-11-16T15:05:00Z');
const REF = '6f0b7c1e-2a4d-4f7e-9a51-1c2d3e4f5a6b';

interface Row {
  id: string;
  supplierId: string;
  sender: 'WORKER' | 'OPERATIONS';
  body: string;
  authorId: string | null;
  serviceItemId: string | null;
  writtenAt: Date | null;
  clientRef: string | null;
  readAt: Date | null;
  createdAt: Date;
}

const SUPPLIERS = {
  'supplier-reinier': {
    id: 'supplier-reinier',
    userId: 'u-reinier',
    category: 'DRIVER',
    primaryPhone: '+5352413388',
    user: { fullName: 'Reinier Soto', email: 'driver@example.test' },
  },
  'supplier-lazaro': {
    id: 'supplier-lazaro',
    userId: 'u-lazaro',
    category: 'DRIVER',
    primaryPhone: '+5358800000',
    user: { fullName: 'Lázaro Pérez', email: 'lazaro@example.test' },
  },
} as const;

/** Today's job of Reinier's, an offer of Lázaro's, and a job of Lázaro's alone. */
const ITEMS: Record<
  string,
  {
    supplierId: string | null;
    dispatchOffers: Array<{ supplierId: string }>;
    serviceDateStart: Date;
    serviceDateEnd: Date;
    reservation: { bookingCode: string };
  }
> = {
  'item-today': {
    supplierId: 'supplier-reinier',
    dispatchOffers: [{ supplierId: 'supplier-reinier' }],
    serviceDateStart: new Date('2026-11-16T00:00:00Z'),
    serviceDateEnd: new Date('2026-11-16T00:00:00Z'),
    reservation: { bookingCode: 'VX-7K2M9Q' },
  },
  'item-offered': {
    supplierId: null,
    dispatchOffers: [{ supplierId: 'supplier-reinier' }],
    serviceDateStart: new Date('2026-11-20T00:00:00Z'),
    serviceDateEnd: new Date('2026-11-20T00:00:00Z'),
    reservation: { bookingCode: 'VX-3PA8ZT' },
  },
  'item-lazaro': {
    supplierId: 'supplier-lazaro',
    dispatchOffers: [{ supplierId: 'supplier-lazaro' }],
    serviceDateStart: new Date('2026-11-18T00:00:00Z'),
    serviceDateEnd: new Date('2026-11-18T00:00:00Z'),
    reservation: { bookingCode: 'VX-6RQ4JD' },
  },
};

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    const field = row[key as keyof Row];
    if (value && typeof value === 'object' && 'in' in value) {
      return (value as { in: unknown[] }).in.includes(field);
    }
    return field === value;
  });
}

function service(rows: Row[] = []) {
  const published: Array<{ type: string; sender?: string }> = [];
  const mailed: EmailMessage[] = [];
  const view = (row: Row) => ({
    ...row,
    author: row.authorId === 'u-ana' ? { fullName: 'Ana Rodríguez' } : null,
    serviceItem: row.serviceItemId ? ITEMS[row.serviceItemId] : null,
  });
  const latestFirst = (list: Row[]) =>
    [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const distinctSupplier = (list: Row[]) =>
    list.filter(
      (row, index) =>
        list.findIndex((other) => other.supplierId === row.supplierId) === index,
    );
  const prisma = {
    supplierProfile: {
      findUnique: async (args: { where: { userId?: string; id?: string } }) =>
        Object.values(SUPPLIERS).find(
          (row) => row.userId === args.where.userId || row.id === args.where.id,
        ) ?? null,
      findMany: async (args: { where: { id: { in: string[] } } }) =>
        Object.values(SUPPLIERS).filter((row) => args.where.id.in.includes(row.id)),
    },
    serviceItem: {
      findUnique: async (args: { where: { id: string } }) => ITEMS[args.where.id] ?? null,
      findMany: async (args: { where: { supplierId: { in: string[] } } }) =>
        Object.entries(ITEMS)
          .filter(([, item]) => args.where.supplierId.in.includes(item.supplierId ?? ''))
          .map(([id, item]) => ({
            id,
            supplierId: item.supplierId,
            reservationId: `booking-${id}`,
            serviceType: 'TRANSPORTATION',
            province: 'La Habana',
            serviceDateStart: item.serviceDateStart,
            serviceDateEnd: item.serviceDateEnd,
            reservation: item.reservation,
          })),
    },
    reservation: {
      findUnique: async () => ({
        serviceItems: [
          {
            id: 'item-today',
            supplierId: 'supplier-reinier',
            supplier: SUPPLIERS['supplier-reinier'],
          },
        ],
      }),
    },
    workerMessage: {
      findUnique: async (args: { where: { clientRef: string } }) => {
        const row = rows.find(
          (candidate) => candidate.clientRef === args.where.clientRef,
        );
        return row ? view(row) : null;
      },
      findMany: async (args: {
        where?: Record<string, unknown>;
        take?: number;
        distinct?: string[];
      }) => {
        let list = latestFirst(rows.filter((row) => matches(row, args.where ?? {})));
        if (args.distinct) list = distinctSupplier(list);
        return list.slice(0, args.take ?? list.length).map(view);
      },
      count: async (args: { where: Record<string, unknown> }) =>
        rows.filter((row) => matches(row, args.where)).length,
      groupBy: async (args: { where: Record<string, unknown> }) => {
        const counts = new Map<string, number>();
        for (const row of rows.filter((candidate) => matches(candidate, args.where))) {
          counts.set(row.supplierId, (counts.get(row.supplierId) ?? 0) + 1);
        }
        return [...counts].map(([supplierId, all]) => ({
          supplierId,
          _count: { _all: all },
        }));
      },
      create: async (args: { data: Partial<Row> }) => {
        const row: Row = {
          id: `message-${rows.length + 1}`,
          authorId: null,
          serviceItemId: null,
          writtenAt: null,
          clientRef: null,
          readAt: null,
          createdAt: NOW,
          ...(args.data as Pick<Row, 'supplierId' | 'sender' | 'body'>),
        };
        rows.push(row);
        return view(row);
      },
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Partial<Row>;
      }) => {
        const hit = rows.filter((row) => matches(row, args.where));
        for (const row of hit) Object.assign(row, args.data);
        return { count: hit.length };
      },
    },
  };
  const publisher: EscalationPublisher = {
    publish: (event) => published.push(event as { type: string; sender?: string }),
  };
  const mailer: Mailer = {
    send: async (message) => {
      mailed.push(message);
    },
  };
  const tenant = {
    branding: {
      agencyName: 'Vereda',
      licenseNumber: 'MINTUR-TEST',
      primaryColor: '#2C5F52',
    },
  } as unknown as TenantConfig;
  return {
    messages: new WorkerMessagesService(
      prisma as unknown as PrismaService,
      publisher,
      mailer,
      tenant,
    ),
    rows,
    published,
    mailed,
  };
}

function message(overrides: Partial<Row>): Row {
  return {
    id: 'm-1',
    supplierId: 'supplier-reinier',
    sender: 'WORKER',
    body: 'Listo.',
    authorId: null,
    serviceItemId: null,
    writtenAt: null,
    clientRef: null,
    readAt: null,
    createdAt: new Date('2026-11-16T13:00:00Z'),
    ...overrides,
  };
}

const SEND = {
  body: 'Listo, salgo a las 15:30. Combustible ok.',
  clientRef: REF,
  serviceItemId: 'item-today',
  writtenAt: '2026-11-16T13:52:00Z',
};

describe("a worker's message (docs/schema-w-messages.md M2, M4, M5)", () => {
  it('keeps the time of writing, names the job and tells the desk', async () => {
    process.env.OPS_NOTIFY_EMAIL = 'desk@example.test';
    const { messages, published, mailed } = service();
    const sent = await messages.workerSend(WORKER, SEND, NOW);
    expect(sent).toMatchObject({
      sender: 'WORKER',
      serviceItemId: 'item-today',
      bookingCode: 'VX-7K2M9Q',
      writtenAt: '2026-11-16T13:52:00.000Z',
      createdAt: NOW.toISOString(),
      authorName: null,
    });
    expect(published).toEqual([
      expect.objectContaining({ type: 'worker.message', sender: 'WORKER' }),
    ]);
    expect(mailed[0]?.subject).toBe(
      'Worker message from Reinier Soto about booking VX-7K2M9Q',
    );
    delete process.env.OPS_NOTIFY_EMAIL;
  });

  it('keeps a resent message once and answers with the first', async () => {
    const { messages, rows, published } = service();
    const first = await messages.workerSend(WORKER, SEND, NOW);
    const again = await messages.workerSend(WORKER, SEND, NOW);
    expect(again.id).toBe(first.id);
    expect(rows).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  it("refuses another worker's id rather than showing their message", async () => {
    const { messages } = service([
      message({ supplierId: 'supplier-lazaro', clientRef: REF }),
    ]);
    await expect(messages.workerSend(WORKER, SEND, NOW)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('lets a worker ask about an offer, never about a job of someone else', async () => {
    const { messages } = service();
    await expect(
      messages.workerSend(WORKER, { ...SEND, serviceItemId: 'item-offered' }, NOW),
    ).resolves.toMatchObject({ bookingCode: 'VX-3PA8ZT' });
    await expect(
      messages.workerSend(
        WORKER,
        {
          ...SEND,
          clientRef: '7f0b7c1e-2a4d-4f7e-9a51-1c2d3e4f5a6b',
          serviceItemId: 'item-lazaro',
        },
        NOW,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("refuses a time of writing ahead of the API's clock", async () => {
    const { messages } = service();
    await expect(
      messages.workerSend(WORKER, { ...SEND, writtenAt: '2026-11-16T15:30:00Z' }, NOW),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('refuses an account with no supplier profile', async () => {
    const { messages } = service();
    await expect(
      messages.workerSend({ ...WORKER, id: 'u-nobody' }, SEND, NOW),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("the desk's side of a worker's thread (M3, M6, M7)", () => {
  it("signs the desk's message with the writer's first name only", async () => {
    const { messages, published } = service();
    const sent = await messages.deskSend(
      DESK,
      'supplier-reinier',
      { body: 'Vuelo IB 6621 a tiempo.', serviceItemId: 'item-today' },
      NOW,
    );
    expect(sent).toMatchObject({
      sender: 'OPERATIONS',
      authorName: 'Ana',
      writtenAt: null,
    });
    expect(published[0]).toMatchObject({ type: 'worker.message', sender: 'OPERATIONS' });
  });

  it("refuses naming a booking's service the worker does not hold", async () => {
    const { messages } = service();
    await expect(
      messages.deskSend(
        DESK,
        'supplier-reinier',
        { body: 'Hola', serviceItemId: 'item-lazaro' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("reads each side's messages only when the other side opens the thread", async () => {
    const rows = [
      message({ id: 'w', sender: 'WORKER' }),
      message({ id: 'd', sender: 'OPERATIONS', authorId: 'u-ana' }),
    ];
    const { messages } = service(rows);
    expect(await messages.workerThread(WORKER)).toMatchObject({ unread: 1 });
    expect(await messages.deskMarkRead('supplier-reinier', NOW)).toEqual({ read: 1 });
    expect(rows.find((row) => row.id === 'd')?.readAt).toBeNull();
    expect(await messages.workerMarkRead(WORKER, NOW)).toEqual({ read: 1 });
    expect(await messages.workerThread(WORKER)).toMatchObject({ unread: 0 });
  });
});

describe("AL-Inbox's worker threads and A-Booking's card (M6)", () => {
  it("puts a worker waiting about today's job first, with their job line", async () => {
    const { messages } = service([
      message({
        id: 'lazaro',
        supplierId: 'supplier-lazaro',
        createdAt: new Date('2026-11-16T14:59:00Z'),
        readAt: NOW,
      }),
      message({
        id: 'reinier',
        serviceItemId: 'item-today',
        createdAt: new Date('2026-11-16T13:52:00Z'),
      }),
    ]);
    const threads = await messages.inboxThreads(NOW);
    expect(threads.map((thread) => thread.supplierId)).toEqual([
      'supplier-reinier',
      'supplier-lazaro',
    ]);
    expect(threads[0]).toMatchObject({
      workerName: 'Reinier Soto',
      urgent: true,
      jobToday: true,
      unread: 1,
      job: { serviceItemId: 'item-today', bookingCode: 'VX-7K2M9Q' },
    });
    expect(threads[1]).toMatchObject({ urgent: false, unread: 0 });
  });

  it("lists the booking's workers with their latest message about it", async () => {
    const { messages } = service([
      message({ id: 'other', body: 'Mañana no puedo.' }),
      message({ id: 'about', serviceItemId: 'item-today', body: 'Listo.' }),
    ]);
    const [card] = await messages.bookingThreads('booking-1');
    expect(card).toMatchObject({
      workerName: 'Reinier Soto',
      serviceItemIds: ['item-today'],
      lastMessage: { body: 'Listo.', sender: 'WORKER' },
      unread: 1,
    });
  });
});
