import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const BOOKING_CODE = 'E2EREM01';
const TRAVELER_EMAIL = 'traveler@example.test';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

interface MailpitMessage {
  ID: string;
  Subject: string;
  To?: { Address: string }[];
}

function midnightPlus(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  );
}

async function deleteFixture(): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { bookingCode: BOOKING_CODE },
    include: { instalments: { select: { id: true } } },
  });
  if (!reservation) return;
  await prisma.auditLog.deleteMany({
    where: {
      entityType: 'PaymentInstalment',
      entityId: { in: reservation.instalments.map((row) => row.id) },
    },
  });
  await prisma.reservation.delete({ where: { id: reservation.id } });
}

async function matchingMessages(): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
  const { messages } = (await response.json()) as { messages: MailpitMessage[] };
  return messages.filter(
    (candidate) =>
      candidate.To?.some((recipient) => recipient.Address === TRAVELER_EMAIL) &&
      candidate.Subject.includes(BOOKING_CODE),
  );
}

test.describe('instalment reminders', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.afterAll(async () => {
    await deleteFixture();
    await prisma.$disconnect();
  });

  test('sends the 7, 3 and 1-day balance reminders once', async ({ page }) => {
    await deleteFixture();
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: TRAVELER_EMAIL },
    });
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING_CODE,
        startDate: new Date('2027-07-01T00:00:00Z'),
        endDate: new Date('2027-07-08T00:00:00Z'),
        status: 'CONFIRMED',
        totalCurrency: 'EUR',
        totalAmount: '2400.00',
        instalments: {
          create: [
            {
              kind: 'BALANCE',
              position: 0,
              amount: '600.00',
              currency: 'EUR',
              dueAt: midnightPlus(7),
              status: 'DUE',
            },
            {
              kind: 'BALANCE',
              position: 1,
              amount: '600.00',
              currency: 'EUR',
              dueAt: midnightPlus(3),
              status: 'DUE',
            },
            {
              kind: 'BALANCE',
              position: 2,
              amount: '600.00',
              currency: 'EUR',
              dueAt: midnightPlus(1),
              status: 'DUE',
            },
          ],
        },
      },
      include: { instalments: { select: { id: true } } },
    });

    try {
      await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' }).catch(
        () => undefined,
      );

      const first = await page.request.post('/api/ota/payments/reminders/scan');
      expect(first.ok()).toBeTruthy();
      const firstBody = (await first.json()) as { sent: number };
      expect(firstBody.sent).toBeGreaterThanOrEqual(3);

      await expect(async () => {
        const messages = await matchingMessages();
        expect(messages).toHaveLength(3);
        expect(messages.map((message) => message.Subject).join(' ')).toContain('day');
      }).toPass();

      const second = await page.request.post('/api/ota/payments/reminders/scan');
      expect(second.ok()).toBeTruthy();
      const secondBody = (await second.json()) as { sent: number };
      expect(secondBody.sent).toBe(0);

      const audits = await prisma.auditLog.count({
        where: {
          action: 'payment.reminder_sent',
          entityType: 'PaymentInstalment',
          entityId: { in: reservation.instalments.map((row) => row.id) },
        },
      });
      expect(audits).toBe(3);
      expect(await matchingMessages()).toHaveLength(3);
    } finally {
      await deleteFixture();
    }
  });
});
