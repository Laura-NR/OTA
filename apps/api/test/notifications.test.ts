import { parseTenantConfig } from '@ota/config';
import type { EmailMessage } from '@ota/email';
import { describe, expect, it } from 'vitest';

import type { DocumentsService } from '../src/documents/documents.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NoopReminderScheduler } from '../src/payments/reminders.scheduler';
import type { PrismaService } from '../src/prisma/prisma.service';

const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-18T09:00:00Z');

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
});

interface Trip {
  id: string;
  bookingCode: string;
  status: string;
  startDate: Date;
  endDate: Date;
  completedAt: Date | null;
  reviewed: boolean;
}

interface Audit {
  action: string;
  entityId: string;
  createdAt: Date;
}

const user = {
  email: 'jane@example.test',
  fullName: 'Jane',
  locale: 'en',
  anonymizedAt: null,
};

function setup(trips: Trip[]) {
  const audits: Audit[] = [];
  const sent: EmailMessage[] = [];
  let clock = NOW;
  const prisma = {
    reservation: {
      findMany: async (args: {
        where: {
          status: string;
          completedAt?: { gte: Date; lte: Date };
          startDate?: { gte: Date; lt: Date };
        };
      }) =>
        trips
          .filter((trip) => trip.status === args.where.status)
          .filter((trip) => {
            const completed = args.where.completedAt;
            if (completed) {
              return (
                !trip.reviewed &&
                trip.completedAt !== null &&
                trip.completedAt >= completed.gte &&
                trip.completedAt <= completed.lte
              );
            }
            const start = args.where.startDate!;
            return trip.startDate >= start.gte && trip.startDate < start.lt;
          })
          .map((trip) => ({
            ...trip,
            totalCurrency: 'EUR',
            user,
            package: { name: 'Eco-Tourism in Viñales' },
            serviceItems: [],
            instalments: [],
          })),
    },
    auditLog: {
      findMany: async (args: { where: { action: string; entityId: string } }) =>
        audits.filter(
          (audit) =>
            audit.action === args.where.action && audit.entityId === args.where.entityId,
        ),
      findFirst: async (args: { where: { action: string; entityId: string } }) =>
        audits.find(
          (audit) =>
            audit.action === args.where.action && audit.entityId === args.where.entityId,
        ) ?? null,
      create: async (args: { data: { action: string; entityId: string } }) => {
        audits.push({ ...args.data, createdAt: clock });
        return args.data;
      },
    },
  };
  const documents = {
    attachments: async () => [],
  } as unknown as DocumentsService;
  const service = new NotificationsService(
    prisma as unknown as PrismaService,
    documents,
    {
      send: async (message) => {
        sent.push(message);
      },
    },
    tenant,
    new NoopReminderScheduler(),
  );
  const scanAt = (at: Date) => {
    clock = at;
    return service.scan(at);
  };
  return { scanAt, sent, audits };
}

const completed = (daysAgo: number, overrides: Partial<Trip> = {}): Trip => ({
  id: 'r-done',
  bookingCode: 'DONE0001',
  status: 'COMPLETED',
  startDate: new Date('2026-10-01T00:00:00Z'),
  endDate: new Date('2026-10-08T00:00:00Z'),
  completedAt: new Date(NOW.getTime() - daysAgo * DAY_MS),
  reviewed: false,
  ...overrides,
});

describe('traveler notification scan', () => {
  it('asks for the review a day after completion, reminds once five days later, then stops', async () => {
    const { scanAt, sent } = setup([completed(2)]);

    expect(await scanAt(NOW)).toEqual({ reviewRequests: 1, reconfirmations: 0 });
    expect(sent[0]!.subject).toBe('How was Eco-Tourism in Viñales? · DONE0001');
    // Too soon for the reminder.
    expect((await scanAt(new Date(NOW.getTime() + 4 * DAY_MS))).reviewRequests).toBe(0);
    // Five days after the request: the one reminder.
    expect((await scanAt(new Date(NOW.getTime() + 5 * DAY_MS))).reviewRequests).toBe(1);
    expect(sent[1]!.subject).toBe('A minute for Eco-Tourism in Viñales? · DONE0001');
    expect((await scanAt(new Date(NOW.getTime() + 12 * DAY_MS))).reviewRequests).toBe(0);
  });

  it('never asks before a day has passed, for a reviewed trip, or past the horizon', async () => {
    const { scanAt, sent } = setup([
      completed(0.5, { id: 'r-recent' }),
      completed(3, { id: 'r-reviewed', reviewed: true }),
      completed(40, { id: 'r-old' }),
    ]);
    expect((await scanAt(NOW)).reviewRequests).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('reconfirms a confirmed trip seven UTC days before it starts, once', async () => {
    const { scanAt, sent } = setup([
      {
        id: 'r-soon',
        bookingCode: 'SOON0001',
        status: 'CONFIRMED',
        startDate: new Date('2026-10-25T00:00:00Z'),
        endDate: new Date('2026-11-01T00:00:00Z'),
        completedAt: null,
        reviewed: false,
      },
      {
        id: 'r-later',
        bookingCode: 'LATE0001',
        status: 'CONFIRMED',
        startDate: new Date('2026-10-26T00:00:00Z'),
        endDate: new Date('2026-11-02T00:00:00Z'),
        completedAt: null,
        reviewed: false,
      },
    ]);

    expect(await scanAt(NOW)).toEqual({ reviewRequests: 0, reconfirmations: 1 });
    expect(sent[0]!.subject).toBe('One week to go · Eco-Tourism in Viñales · SOON0001');
    expect((await scanAt(new Date(NOW.getTime() + 3_600_000))).reconfirmations).toBe(0);
  });
});
