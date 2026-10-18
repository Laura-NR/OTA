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

    // Step 1: one adult, three nights in Sancti Spíritus (the seed's
    // experience is there), a moderate pace and an interest.
    await expect(async () => {
      await page.getByRole('button', { name: 'Remove one adult' }).click();
      await expect(page.getByRole('button', { name: 'Remove one adult' })).toBeDisabled({
        timeout: 2_000,
      });
    }).toPass();
    await page.getByLabel('Arrival in Cuba').fill('2027-03-01');
    await page.getByRole('button', { name: /^Sancti Spíritus/ }).click();
    for (let night = 10; night > 3; night -= 1) {
      await page.getByRole('button', { name: 'One night fewer', exact: true }).click();
    }
    await expect(page.getByText('Your route · 3 of 3 nights placed')).toBeVisible();
    await page.getByRole('button', { name: 'Nature & birding' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2: transport style; step 3: a stay style per stop.
    await page.getByLabel(/^Private minivan with driver/).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Stay style in Sancti Spíritus').selectOption('heritage');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 4: the stop's activity and a shared guide; the estimate follows.
    await page.getByLabel('Trinidad Heritage Walk').check();
    await page.getByLabel(/^Shared guide on activity days/).check();
    const estimate = page.getByRole('complementary', { name: 'Estimate' });
    await expect(estimate.getByText('Activities · 1')).toBeVisible();
    await expect(estimate.getByText(/^Sample rates/)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 5: the summary and the notes.
    await expect(page.getByText('Sancti Spíritus (3 nights)')).toBeVisible();
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
    // The structured route, day plan and options travel with the version.
    // The request's route reaches the desk and seeds the first version's stops.
    await expect(page.getByText('1. Sancti Spíritus')).toBeVisible();
    await expect(page.getByLabel('Stop 1: place')).toHaveValue('Sancti Spíritus');
    await expect(page.getByLabel('Stop 1: nights')).toHaveValue('3');
    await expect(page.getByLabel('Stop 1: stay')).toHaveValue('Colonial heritage casa');
    await page.getByLabel('Stop 1: stay').fill('Casa Yolanda');
    await expect(async () => {
      await page.getByRole('button', { name: 'Add a day' }).click();
      await expect(page.getByLabel('Day 1: where')).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await page.getByLabel('Day 1: where').fill('Trinidad');
    await page.getByLabel('Day 1: plan').fill('Colonial centre on foot.');
    await page.getByLabel('Day 1: with').fill('Guide Osvaldo');
    await page.getByRole('button', { name: 'Add an option' }).click();
    await page.getByLabel('Option 1', { exact: true }).fill('Sail Cienfuegos bay');
    await page.getByLabel('Option 1: price').fill('90');
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
    const route = page.getByRole('region', { name: 'Route' });
    await expect(route.getByText('Sancti Spíritus')).toBeVisible();
    await expect(route.getByText('3 nights · Casa Yolanda')).toBeVisible();
    const days = page.getByRole('region', { name: 'Day by day' });
    await expect(days.getByText('Colonial centre on foot.')).toBeVisible();
    await expect(days.getByText('With Guide Osvaldo')).toBeVisible();
    const options = page.getByRole('region', { name: 'Options you can add' });
    await expect(options.getByText('Sail Cienfuegos bay')).toBeVisible();
    await expect(options.getByText('+ €90')).toBeVisible();
    const travelerPdf = await page.request.get(
      `${STOREFRONT_URL}${await page.getByRole('link', { name: 'Download the PDF' }).getAttribute('href')}`,
    );
    expect(travelerPdf.headers()['content-type']).toBe('application/pdf');
    expect((await travelerPdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await page.getByRole('button', { name: 'Accept this proposal' }).click();
    await expect(page).toHaveURL(/\/account\/reservations\/[0-9a-f-]+$/);
    // The desk has not dispatched yet: the provider requests have not started.
    const providers = page.getByRole('region', {
      name: 'Your hosts, guides and drivers',
    });
    await expect(providers.getByText('0 of 1 services confirmed')).toBeVisible();
    await expect(providers.getByText(/^Our desk sends a request/)).toBeVisible();

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
