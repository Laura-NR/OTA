import { PrismaClient } from '@ota/db';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const TRAVELER_EMAIL = 'traveler@example.test';
const RETENTION_EMAIL = 'retention-reminder-e2e@example.test';
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** E-Invoice → E-Reminder → E-Confirmed on one booking; E-NPS; E-Reconfirm. */
const SECURED = 'E2ENTF01';
const COMPLETED = 'E2ENTF02';
const SOON = 'E2ENTF03';
const CODES = [SECURED, COMPLETED, SOON];

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

interface MailpitMessage {
  ID: string;
  Subject: string;
  To?: { Address: string }[];
}

interface MailpitDetail {
  Text?: string;
  Attachments?: { FileName: string; ContentType: string; PartID: string }[];
}

function midnightPlus(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  );
}

async function messagesFor(to: string, includes: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=200`);
  const { messages } = (await response.json()) as { messages: MailpitMessage[] };
  return messages.filter(
    (message) =>
      message.To?.some((recipient) => recipient.Address === to) &&
      message.Subject.includes(includes),
  );
}

/** The one message whose subject contains `includes` and matches `subject`, waited for. */
async function oneMessage(to: string, includes: string, subject: RegExp) {
  let id = '';
  await expect(async () => {
    const messages = (await messagesFor(to, includes)).filter((message) =>
      subject.test(message.Subject),
    );
    expect(messages).toHaveLength(1);
    id = messages[0]!.ID;
  }).toPass({ timeout: 20_000 });
  const detail = (await (
    await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
  ).json()) as MailpitDetail;
  return { id, detail };
}

async function pdfPart(id: string, partId: string): Promise<string> {
  const part = await fetch(`${MAILPIT_URL}/api/v1/message/${id}/part/${partId}`);
  return Buffer.from(await part.arrayBuffer())
    .subarray(0, 5)
    .toString();
}

async function post(request: APIRequestContext, path: string, data?: unknown) {
  const response = await request.post(`/api/ota${path}`, data ? { data } : undefined);
  expect(response.ok(), `${path} → ${response.status()}`).toBeTruthy();
  return response.json();
}

async function cleanup(): Promise<void> {
  for (const code of CODES) {
    const reservation = await prisma.reservation.findUnique({
      where: { bookingCode: code },
      include: {
        instalments: { select: { id: true } },
        payments: { select: { id: true } },
      },
    });
    if (reservation) {
      await prisma.auditLog.deleteMany({
        where: {
          entityId: {
            in: [
              ...reservation.instalments.map((row) => row.id),
              ...reservation.payments.map((row) => row.id),
            ],
          },
        },
      });
    }
    await deleteReservationFixture(prisma, code);
  }
  const user = await prisma.user.findUnique({ where: { email: RETENTION_EMAIL } });
  if (user) {
    await prisma.auditLog.deleteMany({ where: { entityId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

/**
 * Phase 6 emails, each checked in Mailpit: E-Invoice when the booking is
 * secured, the 24-hour payment-window reminder, E-Confirmed with the voucher
 * and invoice attached, the trip review request and its one reminder (E-NPS,
 * adapted), the one-week reconfirmation with the voucher, and the retention
 * reminder a week before the deadline.
 */
test.describe('Phase 6 notifications', () => {
  let travelerId = '';
  let packageId = '';

  test.beforeAll(async () => {
    await cleanup();
    const [traveler, pkg] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: TRAVELER_EMAIL } }),
      prisma.package.findUniqueOrThrow({ where: { slug: 'trinidad-heritage-trail' } }),
    ]);
    travelerId = traveler.id;
    packageId = pkg.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    // signIn clears Mailpit before its magic link; clear it again so only
    // this spec's messages are counted.
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
  });

  test('secured → 24-hour reminder → confirmed with documents', async ({ page }) => {
    const start = midnightPlus(120);
    const reservation = await prisma.reservation.create({
      data: {
        userId: travelerId,
        packageId,
        bookingCode: SECURED,
        startDate: start,
        endDate: new Date(start.getTime() + 3 * DAY_MS),
        status: 'ASSEMBLY_AND_ESCALATION',
        totalCurrency: 'EUR',
        totalAmount: '1000.00',
        serviceItems: {
          create: {
            serviceType: 'ACCOMMODATION',
            status: 'ACCEPTED',
            province: 'Sancti Spíritus',
            serviceDateStart: start,
            serviceDateEnd: new Date(start.getTime() + 3 * DAY_MS),
          },
        },
      },
    });

    // E-Invoice: every host has confirmed.
    await post(page.request, `/reservations/${reservation.id}/transition`, {
      to: 'SECURED_AND_INVOICED',
    });
    const secured = await oneMessage(
      TRAVELER_EMAIL,
      SECURED,
      /^Your trip is secured · choose how to pay · E2ENTF01$/,
    );
    expect(secured.detail.Text).toContain('Trinidad Heritage Trail');
    expect(secured.detail.Text).toContain('the full €1,000.00');

    // The traveler's first link: a deposit window. 20 hours before it closes,
    // the window scan sends the 24-hour reminder, once.
    await post(page.request, `/reservations/${reservation.id}/payments`, {
      rail: 'OPEN_BANKING_SEPA',
      plan: 'DEPOSIT',
    });
    const deposit = await prisma.paymentInstalment.findFirstOrThrow({
      where: { reservationId: reservation.id, position: 0 },
    });
    await prisma.paymentInstalment.update({
      where: { id: deposit.id },
      data: { dueAt: new Date(Date.now() + 20 * HOUR_MS) },
    });
    await post(page.request, '/payments/reminders/window-scan');
    await oneMessage(
      TRAVELER_EMAIL,
      SECURED,
      /^24 hours left to pay your (deposit|payment)/,
    );
    await post(page.request, '/payments/reminders/window-scan');
    expect(
      (await messagesFor(TRAVELER_EMAIL, SECURED)).filter((message) =>
        message.Subject.startsWith('24 hours left'),
      ),
    ).toHaveLength(1);

    // E-Confirmed: the desk confirms the transfer; documents issue and travel
    // with the email.
    const receipt = await prisma.paymentReceipt.findFirstOrThrow({
      where: { reservationId: reservation.id, status: 'PENDING' },
    });
    await post(
      page.request,
      `/reservations/${reservation.id}/payments/${receipt.id}/confirm`,
    );
    const confirmed = await oneMessage(
      TRAVELER_EMAIL,
      `Confirmed: Trinidad Heritage Trail`,
      /^Confirmed: Trinidad Heritage Trail, .* · E2ENTF01$/,
    );
    expect(confirmed.detail.Text).toContain('We received your');
    expect(confirmed.detail.Text).toContain(
      `/account/reservations/${reservation.id}/confirmation`,
    );
    const names = (confirmed.detail.Attachments ?? [])
      .map((file) => file.FileName)
      .sort();
    expect(names).toEqual(['invoice-E2ENTF01.pdf', 'voucher-E2ENTF01.pdf']);
    for (const file of confirmed.detail.Attachments ?? []) {
      expect(await pdfPart(confirmed.id, file.PartID)).toBe('%PDF-');
    }
  });

  test('asks for the trip review, reminds once, then stops', async ({ page }) => {
    const start = midnightPlus(-10);
    const reservation = await prisma.reservation.create({
      data: {
        userId: travelerId,
        packageId,
        bookingCode: COMPLETED,
        startDate: start,
        endDate: new Date(start.getTime() + 3 * DAY_MS),
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 2 * DAY_MS),
        totalCurrency: 'EUR',
        totalAmount: '600.00',
      },
    });

    await post(page.request, '/notifications/scan');
    const first = await oneMessage(
      TRAVELER_EMAIL,
      COMPLETED,
      /^How was Trinidad Heritage Trail\? · E2ENTF02$/,
    );
    expect(first.detail.Text).toContain(`/account/reservations/${reservation.id}`);

    // Five days on, the one reminder; after it, nothing more.
    await prisma.auditLog.updateMany({
      where: { action: 'email.review_request_sent', entityId: reservation.id },
      data: { createdAt: new Date(Date.now() - 6 * DAY_MS) },
    });
    await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' });
    await post(page.request, '/notifications/scan');
    await oneMessage(
      TRAVELER_EMAIL,
      COMPLETED,
      /^A minute for Trinidad Heritage Trail\? · E2ENTF02$/,
    );
    await post(page.request, '/notifications/scan');
    expect(await messagesFor(TRAVELER_EMAIL, COMPLETED)).toHaveLength(1);
  });

  test('reconfirms a confirmed trip a week ahead, with its voucher', async ({ page }) => {
    const start = midnightPlus(7);
    const reservation = await prisma.reservation.create({
      data: {
        userId: travelerId,
        packageId,
        bookingCode: SOON,
        startDate: start,
        endDate: new Date(start.getTime() + 3 * DAY_MS),
        status: 'CONFIRMED',
        totalCurrency: 'EUR',
        totalAmount: '600.00',
        serviceItems: {
          create: {
            serviceType: 'TRANSPORTATION',
            status: 'ACCEPTED',
            province: 'La Habana',
            serviceDateStart: new Date(start.getTime() + 15 * HOUR_MS),
            serviceDateEnd: new Date(start.getTime() + 17 * HOUR_MS),
          },
        },
      },
    });
    // Issue its documents as the desk would.
    await post(page.request, `/reservations/${reservation.id}/documents`);

    await post(page.request, '/notifications/scan');
    const reconfirm = await oneMessage(
      TRAVELER_EMAIL,
      SOON,
      /^One week to go · Trinidad Heritage Trail · E2ENTF03$/,
    );
    expect(reconfirm.detail.Text).toContain('Your first service starts in La Habana');
    expect(reconfirm.detail.Text).toContain('arrival flight');
    const voucher = reconfirm.detail.Attachments?.find(
      (file) => file.FileName === 'voucher-E2ENTF03.pdf',
    );
    expect(await pdfPart(reconfirm.id, voucher!.PartID)).toBe('%PDF-');

    await post(page.request, '/notifications/scan');
    expect(await messagesFor(TRAVELER_EMAIL, SOON)).toHaveLength(1);
  });

  test('reminds a traveler a week before their account is anonymized', async ({
    page,
  }) => {
    await prisma.user.create({
      data: {
        email: RETENTION_EMAIL,
        fullName: 'Retention Reminder',
        role: 'TRAVELER',
        locale: 'fr',
        retentionNoticeSentAt: new Date(Date.now() - 24 * DAY_MS),
      },
    });

    await post(page.request, '/retention/scan');
    const reminder = await oneMessage(RETENTION_EMAIL, 'anonymiserons', /^Rappel : /);
    expect(reminder.detail.Text).toContain('Bonjour Retention Reminder,');
    expect(reminder.detail.Text).toContain('/retention/keep-alive?token=');

    await post(page.request, '/retention/scan');
    expect(await messagesFor(RETENTION_EMAIL, 'anonymiserons')).toHaveLength(1);
  });
});
