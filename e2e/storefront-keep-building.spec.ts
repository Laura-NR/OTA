import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const TRAVELER_EMAIL = 'traveler@example.test';
const REFERENCE = 'VX-C-E2EKEEP1';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

async function cleanup(): Promise<void> {
  const request = await prisma.customRequest.findUnique({
    where: { reference: REFERENCE },
    select: { id: true, proposals: { select: { id: true } } },
  });
  if (!request) return;
  await prisma.auditLog.deleteMany({
    where: {
      entityId: { in: [request.id, ...request.proposals.map((proposal) => proposal.id)] },
    },
  });
  await prisma.customRequest.delete({ where: { id: request.id } });
}

/**
 * "Keep building the trip": the traveler reopens a request that is still
 * being priced, adds a night in the builder and saves it; the desk sees what
 * changed, a publish priced on the old answers is refused with the draft
 * kept, and once the proposal is sent the builder no longer opens it.
 */
test.describe('keep building a submitted trip', () => {
  let proposalId = '';

  test.beforeAll(async () => {
    await cleanup();
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: TRAVELER_EMAIL },
    });
    const request = await prisma.customRequest.create({
      data: {
        userId: traveler.id,
        reference: REFERENCE,
        locale: 'en',
        notes: 'Birding first.',
        payload: {
          startDate: '2027-04-01T00:00:00.000Z',
          endDate: '2027-04-04T00:00:00.000Z',
          adults: 2,
          children: 0,
          inventoryItemIds: [],
          nationality: null,
          budgetPerPerson: null,
          interests: [],
          pace: 'moderate',
          route: [{ province: 'CU07', nights: 3, stay: 'heritage' }],
          transport: null,
          guiding: 'none',
          interpreter: false,
          stepFree: false,
        },
        proposals: { create: {} },
      },
      select: { proposals: { select: { id: true } } },
    });
    proposalId = request.proposals[0]!.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('changes the request, then the desk prices the change', async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: `/en/account/proposals/${proposalId}`,
    });
    await expect(page.getByText('Being priced', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Keep building the trip' }).click();

    // The builder opens on the request's own answers.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Keep building the trip' }),
    ).toBeVisible();
    await expect(page.getByText(`Change request ${REFERENCE}.`)).toBeVisible();
    await expect(page.getByLabel('Arrival in Cuba')).toHaveValue('2027-04-01');
    await expect(page.getByText('Your route · 3 of 3 nights placed')).toBeVisible();

    // One more night, placed in Sancti Spíritus.
    await expect(async () => {
      await page.getByRole('button', { name: 'One night more', exact: true }).click();
      await expect(page.getByText('Your route · 3 of 4 nights placed')).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await page.getByRole('button', { name: 'One night more in Sancti Spíritus' }).click();
    await expect(page.getByText('Your route · 4 of 4 nights placed')).toBeVisible();
    for (let step = 1; step < 5; step += 1) {
      await page.getByRole('button', { name: 'Continue' }).click();
    }
    await expect(page.getByText('Sancti Spíritus (4 nights)')).toBeVisible();
    await expect(page.getByLabel('Must-haves, no-gos, anything else')).toHaveValue(
      'Birding first.',
    );
    await page.getByRole('button', { name: 'Save my changes' }).click();
    await expect(page.getByRole('heading', { name: 'Request updated' })).toBeVisible();

    await page.getByRole('link', { name: 'Open my proposal' }).click();
    await expect(page.getByText(/^You changed this request on /)).toBeVisible();

    // The desk sees the change in the queue and on the request.
    await signIn(page);
    await page.goto('/bookings/proposals');
    const row = page.getByRole('row').filter({ hasText: REFERENCE });
    await expect(row.getByText('Changed', { exact: true })).toBeVisible();
    await row.getByRole('link', { name: REFERENCE }).click();
    await expect(page.getByRole('heading', { name: REFERENCE })).toBeVisible();
    await expect(
      page.getByText(/^Changed by the traveler on .+: dates, route\.$/),
    ).toBeVisible();
    await expect(page.getByText('4 nights', { exact: true })).toBeVisible();
    await expect(
      page.getByText('The traveler can still change this request until you publish.'),
    ).toBeVisible();

    // The traveler changes it again while the desk is writing.
    await page.getByLabel('Proposal summary').fill('Four nights in Trinidad.');
    await page.getByLabel('Line', { exact: true }).fill('Casa, four nights');
    await page.getByLabel('Unit price', { exact: true }).fill('480');
    await prisma.customRequest.update({
      where: { reference: REFERENCE },
      data: { notes: 'Birding first, then the beach.' },
    });
    await page.getByRole('button', { name: 'Publish and send' }).click();
    await expect(
      page.getByText(/^The traveler changed the request while you were writing\./),
    ).toBeVisible();
    await expect(page.getByText('Birding first, then the beach.')).toBeVisible();
    await expect(page.getByLabel('Proposal summary')).toHaveValue(
      'Four nights in Trinidad.',
    );
    await page.getByRole('button', { name: 'Publish and send' }).click();
    await expect(page.getByText('Version 1')).toBeVisible();
    await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();

    // Sent: the builder no longer opens the request.
    await signIn(page, TRAVELER_EMAIL, {
      origin: STOREFRONT_URL,
      callbackPath: `/en/custom?edit=${proposalId}`,
    });
    await expect(
      page.getByRole('heading', { name: 'This request is with our team' }),
    ).toBeVisible();
    await page.goto(`${STOREFRONT_URL}/en/account/proposals/${proposalId}`);
    await expect(page.getByText('Ready to review', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Keep building the trip' })).toHaveCount(
      0,
    );
  });
});
