import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const REMINDER_CODE = 'E2EOFAC1';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

interface MailpitMessage {
  ID: string;
  Subject: string;
  To?: { Address: string }[];
}

async function deleteFixture(): Promise<void> {
  const reservation = await prisma.reservation.findUnique({
    where: { bookingCode: REMINDER_CODE },
  });
  if (!reservation) return;
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Reservation', entityId: reservation.id },
  });
  await prisma.reservation.delete({ where: { id: reservation.id } });
}

test.describe('customer accounts', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.afterAll(async () => {
    await deleteFixture();
    await prisma.$disconnect();
  });

  test('lists accounts and opens a customer profile with trips and retention', async ({
    page,
  }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();

    const response = await page.request.get('/api/ota/customers');
    const customers = (await response.json()) as { id: string; email: string }[];
    const target = customers.find((row) => row.email === 'traveler@example.test');
    expect(target).toBeTruthy();

    await page.goto(`/customers/${target?.id}`);
    await expect(page.getByRole('heading', { name: 'Trips' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'GDPR retention' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'DEMO0001' })).toBeVisible();
  });

  test('sends the OFAC certification reminder and audits it', async ({ page }) => {
    await deleteFixture();
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: 'traveler@example.test' },
    });
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: REMINDER_CODE,
        startDate: new Date('2027-06-10T00:00:00Z'),
        endDate: new Date('2027-06-14T00:00:00Z'),
        status: 'CONFIRMED',
        totalCurrency: 'EUR',
        totalAmount: '1800.00',
        travelers: {
          create: {
            position: 0,
            isLead: true,
            fullName: 'Margaret Chen',
            nationality: 'US',
            usPerson: true,
          },
        },
      },
    });

    try {
      await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' }).catch(
        () => undefined,
      );

      const response = await page.request.get('/api/ota/customers');
      const customers = (await response.json()) as { id: string; email: string }[];
      const target = customers.find((row) => row.email === 'traveler@example.test');
      expect(target).toBeTruthy();

      await page.goto(`/customers/${target?.id}`);
      const row = page.getByRole('row').filter({ hasText: REMINDER_CODE });
      await row.getByRole('button', { name: 'Send certification reminder' }).click();
      await expect(row.getByText('Reminder sent', { exact: true })).toBeVisible();

      await expect(async () => {
        const mail = await fetch(`${MAILPIT_URL}/api/v1/messages`);
        const { messages } = (await mail.json()) as { messages: MailpitMessage[] };
        const message = messages.find(
          (candidate) =>
            candidate.To?.some(
              (recipient) => recipient.Address === 'traveler@example.test',
            ) && candidate.Subject.includes(REMINDER_CODE),
        );
        expect(message?.Subject).toContain('OFAC');
      }).toPass();

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'ofac.reminder_sent', entityId: reservation.id },
      });
      expect(audit?.metadata).toMatchObject({ bookingCode: REMINDER_CODE, missing: 1 });
    } finally {
      await deleteFixture();
    }
  });
});
