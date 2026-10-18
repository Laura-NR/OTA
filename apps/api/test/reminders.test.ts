import { parseTenantConfig } from '@ota/config';
import type { EmailMessage } from '@ota/email';
import { describe, expect, it } from 'vitest';

import { RemindersService } from '../src/payments/reminders.service';
import { NoopReminderScheduler } from '../src/payments/reminders.scheduler';
import type { PrismaService } from '../src/prisma/prisma.service';

const HOUR_MS = 3_600_000;
const NOW = new Date('2026-10-14T12:00:00Z');

const tenant = parseTenantConfig({
  tenantId: 'test-agency',
  branding: { agencyName: 'Test Agency', licenseNumber: 'MINTUR-TEST-1234' },
});

interface Instalment {
  id: string;
  kind: 'DEPOSIT' | 'BALANCE' | 'FULL';
  status: 'DUE' | 'PAID';
  dueAt: Date;
  amount: number;
  currency: string;
}

interface Audit {
  action: string;
  entityId: string;
  metadata: Record<string, unknown>;
}

function setup(instalments: Instalment[], reservationStatus = 'PENDING_PAYMENT') {
  const audits: Audit[] = [];
  const sent: EmailMessage[] = [];
  const reservation = {
    id: 'r1',
    bookingCode: 'REM00001',
    status: reservationStatus,
    user: {
      email: 'jane@example.test',
      fullName: 'Jane',
      locale: 'en',
      anonymizedAt: null,
    },
  };
  const prisma = {
    paymentInstalment: {
      findMany: async (args: {
        where: {
          status: string;
          kind: string | { in: string[] };
          dueAt: { gt?: Date; gte?: Date; lte?: Date; lt?: Date };
        };
      }) =>
        instalments
          .filter((row) => row.status === args.where.status)
          .filter((row) =>
            typeof args.where.kind === 'string'
              ? row.kind === args.where.kind
              : args.where.kind.in.includes(row.kind),
          )
          .filter((row) => {
            const { gt, gte, lte, lt } = args.where.dueAt;
            return (
              (!gt || row.dueAt > gt) &&
              (!gte || row.dueAt >= gte) &&
              (!lte || row.dueAt <= lte) &&
              (!lt || row.dueAt < lt)
            );
          })
          .map((row) => ({ ...row, reservation })),
    },
    auditLog: {
      findFirst: async (args: {
        where: {
          action: string;
          entityId: string;
          AND?: { metadata: { path: string[]; equals: unknown } }[];
          metadata?: { path: string[]; equals: unknown };
        };
      }) => {
        const filters = [
          ...(args.where.AND ?? []),
          ...(args.where.metadata ? [{ metadata: args.where.metadata }] : []),
        ];
        return (
          audits.find(
            (audit) =>
              audit.action === args.where.action &&
              audit.entityId === args.where.entityId &&
              filters.every(
                ({ metadata }) => audit.metadata[metadata.path[0]!] === metadata.equals,
              ),
          ) ?? null
        );
      },
      create: async (args: { data: Audit }) => {
        audits.push(args.data);
        return args.data;
      },
    },
  };
  const service = new RemindersService(
    prisma as unknown as PrismaService,
    {
      send: async (message) => {
        sent.push(message);
      },
    },
    tenant,
    new NoopReminderScheduler(),
    new NoopReminderScheduler(),
  );
  return { service, sent, audits, instalments };
}

const deposit = (dueInHours: number): Instalment => ({
  id: 'i-deposit',
  kind: 'DEPOSIT',
  status: 'DUE',
  dueAt: new Date(NOW.getTime() + dueInHours * HOUR_MS),
  amount: 620,
  currency: 'EUR',
});

describe('payment window reminders (E-Reminder)', () => {
  it('sends the 24-hour reminder once a deposit is due within a day, and only once', async () => {
    const { service, sent } = setup([deposit(20)]);

    expect(await service.scanWindows(NOW)).toEqual({ sent: 1 });
    expect(sent[0]!.subject).toBe('24 hours left to pay your deposit · REM00001');
    expect(await service.scanWindows(new Date(NOW.getTime() + HOUR_MS))).toEqual({
      sent: 0,
    });
  });

  it('sends the 2-hour reminder inside the last two hours, even after the 24-hour one', async () => {
    const { service, sent } = setup([deposit(20)]);
    await service.scanWindows(NOW);

    expect(await service.scanWindows(new Date(NOW.getTime() + 18.5 * HOUR_MS))).toEqual({
      sent: 1,
    });
    expect(sent.map((message) => message.subject)).toEqual([
      '24 hours left to pay your deposit · REM00001',
      '2 hours left to pay your deposit · REM00001',
    ]);
  });

  it('sends only the 2-hour reminder when the window is already that close', async () => {
    const { service, sent } = setup([deposit(1.5)]);
    expect(await service.scanWindows(NOW)).toEqual({ sent: 1 });
    expect(sent[0]!.subject).toMatch(/^2 hours left/);
  });

  it('reminds again for a deadline the desk extended', async () => {
    const { service, instalments } = setup([deposit(20)]);
    await service.scanWindows(NOW);
    instalments[0]!.dueAt = new Date(NOW.getTime() + 23 * HOUR_MS);
    expect(await service.scanWindows(NOW)).toEqual({ sent: 1 });
  });

  it('leaves balances to the 7/3/1 scan, and windows out of it', async () => {
    const { service, sent } = setup([
      {
        id: 'i-balance',
        kind: 'BALANCE',
        status: 'DUE',
        dueAt: new Date(NOW.getTime() + 10 * HOUR_MS),
        amount: 2480,
        currency: 'EUR',
      },
      { ...deposit(30), dueAt: new Date('2026-10-17T00:00:00Z') },
    ]);
    expect(await service.scanWindows(NOW)).toEqual({ sent: 0 });
    // The deposit falls 3 UTC days ahead, but a window gets no 7/3/1 reminder.
    expect(await service.scan(NOW)).toEqual({ sent: 0 });
    expect(sent).toHaveLength(0);
  });

  it('skips a paid window and a cancelled booking', async () => {
    const paid = setup([{ ...deposit(5), status: 'PAID' }]);
    expect(await paid.service.scanWindows(NOW)).toEqual({ sent: 0 });
    const cancelled = setup([deposit(5)], 'CANCELLED');
    expect(await cancelled.service.scanWindows(NOW)).toEqual({ sent: 0 });
  });
});
