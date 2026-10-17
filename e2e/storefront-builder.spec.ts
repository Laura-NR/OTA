import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const TRAVELER_EMAIL = 'traveler@example.test';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

interface MailpitMessage {
  ID: string;
  Subject: string;
  To?: { Address: string }[];
}

interface MailpitDetail {
  Attachments?: { FileName: string; ContentType: string; PartID: string }[];
}

let proposalId = '';
let reference = '';

async function deleteProposal(): Promise<void> {
  if (!proposalId) return;
  const proposal = await prisma.proposal.findUnique({
    where: { id: proposalId },
    select: { id: true, requestId: true, reservationId: true },
  });
  if (!proposal) return;
  await prisma.auditLog.deleteMany({
    where: { entityType: 'Proposal', entityId: proposal.id },
  });
  await prisma.auditLog.deleteMany({
    where: { entityType: 'CustomRequest', entityId: proposal.requestId },
  });
  if (proposal.reservationId) {
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Reservation', entityId: proposal.reservationId },
    });
    await prisma.reservation.delete({ where: { id: proposal.reservationId } });
  }
  await prisma.proposal.delete({ where: { id: proposal.id } });
  await prisma.customRequest.delete({ where: { id: proposal.requestId } });
}

/**
 * The M5 custom-trip vertical slice: a traveler sends a request, the desk
 * prices and sends a proposal (with a Mailpit check of the email and its
 * D-Proposal PDF), and the traveler accepts it. Acceptance creates an
 * ITINERARY_SUBMITTED booking and charges nothing.
 */
test.describe('custom-trip proposals', () => {
  test.beforeAll(async () => {
    await deleteProposal();
  });

  test.afterAll(async () => {
    await deleteProposal();
    await prisma.$disconnect();
  });

  test('sends a request, prices it on the desk and accepts it', async ({ page }) => {
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: '/en/custom',
    });
    await expect(
      page.getByRole('heading', { name: 'Build your itinerary' }),
    ).toBeVisible();

    await page.getByLabel('Start date').fill('2027-03-01');
    await page.getByLabel('End date').fill('2027-03-05');
    await page.getByRole('button', { name: 'Continue' }).click();

    const stay = page.getByRole('checkbox').first();
    if ((await stay.count()) > 0) {
      await stay.check();
    }
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await page
      .getByLabel('Must-haves, no-gos, anything else')
      .fill('Birding first, long walks, casas only.');
    await page.getByRole('button', { name: 'Request my priced proposal' }).click();

    await expect(page.getByRole('heading', { name: 'Proposal requested' })).toBeVisible();
    const link = page.getByRole('link', { name: 'Open my proposal' });
    const href = await link.getAttribute('href');
    proposalId = href?.split('/').filter(Boolean).at(-1) ?? '';
    expect(proposalId).toMatch(/^[0-9a-f-]{36}$/);
    reference =
      (
        await page
          .getByText(/VX-C-[A-Z0-9]{8}/)
          .first()
          .textContent()
      )?.match(/VX-C-[A-Z0-9]{8}/)?.[0] ?? '';
    expect(reference).toMatch(/^VX-C-/);

    await link.click();
    await expect(page).toHaveURL(new RegExp(`/account/proposals/${proposalId}$`));
    await expect(page.getByText('Being priced', { exact: true })).toBeVisible();
    await expect(page.getByText('A specialist is pricing your request.')).toBeVisible();

    // The desk prices it.
    await signIn(page);
    await page.goto('/bookings/proposals');
    await page.getByRole('link', { name: reference }).click();
    await expect(page.getByRole('heading', { name: reference })).toBeVisible();
    await page
      .getByLabel('Proposal summary')
      .fill('Fourteen days west to Trinidad, birding first.');
    await page.getByRole('button', { name: 'Publish and send' }).click();
    await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Version 1')).toBeVisible();
    const deskPdf = await page.request.get(
      (await page.getByRole('link', { name: 'Open the PDF' }).getAttribute('href'))!,
    );
    expect(deskPdf.headers()['content-type']).toBe('application/pdf');
    expect((await deskPdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    let messageId = '';
    await expect(async () => {
      const response = await fetch(`${MAILPIT_URL}/api/v1/messages`);
      const { messages } = (await response.json()) as { messages: MailpitMessage[] };
      const message = messages.find(
        (candidate) =>
          candidate.To?.some((recipient) => recipient.Address === TRAVELER_EMAIL) &&
          candidate.Subject.includes(reference),
      );
      expect(message).toBeTruthy();
      messageId = message!.ID;
    }).toPass();
    // The email carries the version's PDF, a real file.
    const detail = (await (
      await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)
    ).json()) as MailpitDetail;
    const attachment = detail.Attachments?.find(
      (candidate) => candidate.FileName === `${reference}-v1.pdf`,
    );
    expect(attachment?.ContentType).toBe('application/pdf');
    const part = await fetch(
      `${MAILPIT_URL}/api/v1/message/${messageId}/part/${attachment!.PartID}`,
    );
    expect(
      Buffer.from(await part.arrayBuffer())
        .subarray(0, 5)
        .toString(),
    ).toBe('%PDF-');

    // The traveler reviews and accepts it.
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: `/en/account/proposals/${proposalId}`,
    });
    await expect(page.getByText('Ready to review', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Fourteen days west to Trinidad, birding first.'),
    ).toBeVisible();
    const travelerPdf = await page.request.get(
      `${STOREFRONT_URL}${await page.getByRole('link', { name: 'Download the PDF' }).getAttribute('href')}`,
    );
    expect(travelerPdf.headers()['content-type']).toBe('application/pdf');
    expect((await travelerPdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await page.getByRole('button', { name: 'Accept this proposal' }).click();
    await expect(page).toHaveURL(/\/account\/reservations\/[0-9a-f-]+$/);

    const proposal = await prisma.proposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: {
        request: true,
        reservation: {
          include: { priceLines: true, serviceItems: true },
        },
      },
    });
    expect(proposal.status).toBe('ACCEPTED');
    expect(proposal.request.status).toBe('CONVERTED');
    expect(proposal.reservation).toMatchObject({
      status: 'ITINERARY_SUBMITTED',
      partySize: 1,
      totalCurrency: 'EUR',
    });
    expect(proposal.reservation?.priceLines).toHaveLength(1);
    expect(proposal.reservation?.serviceItems).toHaveLength(1);
    const acceptedVersion = await prisma.proposalVersion.findFirst({
      where: { proposalId },
      orderBy: { version: 'desc' },
    });
    expect(Number(proposal.reservation?.totalAmount)).toBe(
      Number(acceptedVersion?.total),
    );
  });
});
