import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
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
    await page.goto(`${STOREFRONT_URL}/join-our-network`);
    await expect(page.getByRole('heading', { name: 'Join our network' })).toBeVisible();

    await page.getByLabel('Full name').fill('E2E Applicant');
    await page.getByLabel('Email').fill(APPLICANT_EMAIL);
    await page.getByLabel('Phone').fill('+53 5555 9999');
    await page.getByLabel('Provinces (comma-separated)').fill('La Habana');
    await page.getByLabel('RTN licence number').fill(APPLICANT_LICENSE);
    await page.getByRole('button', { name: 'Apply to join' }).click();
    await expect(page.getByText('your application is in')).toBeVisible();

    await signIn(page);
    await page.goto('/applications');
    const row = page.locator('tr', { hasText: APPLICANT_EMAIL });
    await expect(row.getByText('PENDING')).toBeVisible();
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(
      page.locator('tr', { hasText: APPLICANT_EMAIL }).getByText('APPROVED'),
    ).toBeVisible();
  });
});
