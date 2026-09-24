import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

const FILENAME = 'e2e-import.csv';
const ITEM_NAME = 'E2E Imported Stay';
const CSV = `type,name,basePrice,province
ACCOMMODATION,${ITEM_NAME},80,La Habana
`;

test.describe('bulk import', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test.afterEach(async () => {
    await prisma.inventoryItem.deleteMany({ where: { name: ITEM_NAME } });
    await prisma.importBatch.deleteMany({ where: { filename: FILENAME } });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('stages a CSV, maps it, and commits it into inventory', async ({ page }) => {
    await page.goto('/imports');

    await page.getByLabel('Spreadsheet (.csv or .xlsx)').setInputFiles({
      name: FILENAME,
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV),
    });

    await expect(page.getByText(/1 row\(s\), 4 column\(s\)/)).toBeVisible();

    // Type, name, and basePrice auto-map from the headers; commit is enabled.
    await page.getByRole('button', { name: 'Commit import' }).click();
    await expect(page.getByText(/Imported 1 inventory item\(s\)/)).toBeVisible();

    await page.goto('/inventory');
    await expect(page.getByRole('link', { name: ITEM_NAME })).toBeVisible();
  });
});
