import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025';
const APPLICANT_EMAIL = 'recruit@example.test';
const APPLICANT_LICENSE = 'RTN-RECRUIT-E2E';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

async function cleanup() {
  await prisma.supplierProfile
    .deleteMany({ where: { rtnLicenseNumber: APPLICANT_LICENSE } })
    .catch(() => undefined);
  await prisma.user
    .deleteMany({ where: { email: APPLICANT_EMAIL } })
    .catch(() => undefined);
  await prisma.supplierApplication
    .deleteMany({ where: { email: APPLICANT_EMAIL } })
    .catch(() => undefined);
}

test.describe('supplier recruitment', () => {
  test.beforeAll(cleanup);
  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('a public application can be submitted and approved', async ({ page }) => {
    await page.goto(`${STOREFRONT_URL}/en/join`);
    await expect(page.getByRole('heading', { name: 'Join our network' })).toBeVisible();

    // Four steps: category, identity, credential, review with the consents.
    await expect(async () => {
      await page.getByRole('radio', { name: /Casa particular host/ }).check();
      await page.getByRole('button', { name: 'Continue' }).click();
      await expect(page.getByLabel('Full name')).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await page.getByLabel('Full name').fill('E2E Applicant');
    await page.getByLabel('Email', { exact: true }).fill(APPLICANT_EMAIL);
    await page.getByLabel('Phone', { exact: true }).fill('+53 5555 9999');
    await page.getByRole('checkbox', { name: 'La Habana' }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('RTN licence number').fill(APPLICANT_LICENSE);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('checkbox', { name: /I authorise/ }).check();
    await page.getByRole('checkbox', { name: /I declare/ }).check();
    await page.getByRole('button', { name: 'Send the application' }).click();
    await expect(page.getByText('your application is in')).toBeVisible();

    await signIn(page);
    await page.goto('/suppliers/applications');
    const row = page.locator('tr', { hasText: APPLICANT_EMAIL });
    await expect(row.getByText('PENDING')).toBeVisible();
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(
      page.locator('tr', { hasText: APPLICANT_EMAIL }).getByText('APPROVED'),
    ).toBeVisible();

    // The new worker is emailed the app's download page (U6a).
    await expect(async () => {
      const search = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${APPLICANT_EMAIL}`)}`,
      );
      const { messages } = (await search.json()) as {
        messages: { ID: string; Subject: string }[];
      };
      const invite = messages.find((message) =>
        message.Subject.includes('app de colaboradores'),
      );
      expect(invite).toBeDefined();
      const detail = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${invite!.ID}`)
      ).json()) as { Text: string };
      expect(detail.Text).toContain(`${STOREFRONT_URL}/app`);
      expect(detail.Text).toContain('+53 5555 9999');
    }).toPass({ timeout: 15_000 });
  });
});
