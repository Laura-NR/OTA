import { PrismaClient } from '@ota/db';
import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

const CASA_EMAIL = 'e2e-casa-resources@example.test';
const DRIVER_EMAIL = 'e2e-driver-resources@example.test';
const CASA_NAME = 'E2E Casa Resources';
const DRIVER_NAME = 'E2E Driver Resources';
const BOOKING = 'E2ESUP01';
const TITLE = 'E2E M6 outage in Matanzas';
const DAY_MS = 86_400_000;

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/**
 * This spec owns the two suppliers above (and their resources and audit
 * rows), booking E2ESUP01 and every case titled "E2E M6…". Matanzas keeps the
 * console's lists to its own suppliers: the seeded ones work in Pinar del Río.
 */
async function cleanup() {
  const cases = await prisma.disruptionCase.findMany({
    where: { title: { startsWith: 'E2E M6' } },
    select: { id: true },
  });
  const caseIds = cases.map((row) => row.id);
  if (caseIds.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { entityType: 'DisruptionCase', entityId: { in: caseIds } },
    });
    await prisma.disruptionCase.deleteMany({ where: { id: { in: caseIds } } });
  }
  await prisma.reservation.deleteMany({ where: { bookingCode: BOOKING } });
  const suppliers = await prisma.supplierProfile.findMany({
    where: { user: { email: { in: [CASA_EMAIL, DRIVER_EMAIL] } } },
    select: { id: true },
  });
  if (suppliers.length > 0) {
    await prisma.auditLog.deleteMany({
      where: {
        entityType: 'SupplierProfile',
        entityId: { in: suppliers.map((row) => row.id) },
      },
    });
  }
  await prisma.user.deleteMany({ where: { email: { in: [CASA_EMAIL, DRIVER_EMAIL] } } });
}

async function createSupplier(
  email: string,
  fullName: string,
  category: 'HOMESTAY_HOST' | 'PRIVATE_DRIVER',
  rtnLicenseNumber: string,
) {
  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      role: 'SERVICE_WORKER',
      supplierProfile: {
        create: {
          category,
          primaryPhone: '+53 5555 0900',
          provincesActive: ['Matanzas'],
          rtnLicenseNumber,
          verificationStatus: 'VERIFIED',
          credentialExpiresAt: new Date(Date.now() + 365 * DAY_MS),
        },
      },
    },
    include: { supplierProfile: true },
  });
  return user.supplierProfile!.id;
}

test.describe('M6 supplier resources', () => {
  let casaId = '';
  let driverId = '';
  let reservationId = '';

  test.beforeAll(async () => {
    await cleanup();
    casaId = await createSupplier(CASA_EMAIL, CASA_NAME, 'HOMESTAY_HOST', 'RTN-E2E-M6-1');
    driverId = await createSupplier(
      DRIVER_EMAIL,
      DRIVER_NAME,
      'PRIVATE_DRIVER',
      'RTN-E2E-M6-2',
    );
    const traveler = await prisma.user.findUniqueOrThrow({
      where: { email: 'traveler@example.test' },
    });
    // A trip under way whose transfer the driver accepted yesterday: the
    // driver's last job, and a supplier involved once the trip joins a case.
    const start = new Date(Date.now() - DAY_MS);
    const reservation = await prisma.reservation.create({
      data: {
        userId: traveler.id,
        bookingCode: BOOKING,
        startDate: start,
        endDate: new Date(start.getTime() + 4 * DAY_MS),
        status: 'IN_PROGRESS',
        totalCurrency: 'EUR',
        totalAmount: '700.00',
        serviceItems: {
          create: {
            serviceType: 'TRANSPORTATION',
            status: 'ACCEPTED',
            province: 'Matanzas',
            supplierId: driverId,
            serviceDateStart: start,
            serviceDateEnd: new Date(start.getTime() + 2 * 3_600_000),
          },
        },
      },
    });
    reservationId = reservation.id;
  });

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test('confirms a casa generator and a driver fuel reserve, then sees them on the register and a case', async ({
    page,
  }) => {
    await signIn(page);

    // The casa's resilience card.
    await page.goto(`/suppliers/${casaId}`);
    await expect(
      page.getByRole('heading', { name: 'Backup power & resilience' }),
    ).toBeVisible();
    await expect(page.getByText('Never confirmed.')).toBeVisible();
    await expect(async () => {
      await page.getByLabel('Generator', { exact: true }).selectOption('OWN');
      await expect(page.getByLabel('Generator hours per day')).toBeEnabled();
    }).toPass();
    await page.getByLabel('Generator hours per day').fill('6');
    await page.getByLabel('Hours as the host gives them').fill('06–09, 18–21');
    await page.getByLabel('Generator fuel on hand · days').fill('2');
    await page.getByLabel('Rooms', { exact: true }).fill('3');
    await page.getByLabel('Guest capacity').fill('6');
    await page.getByLabel('Channel', { exact: true }).selectOption('WHATSAPP');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText(/Last confirmed .* · WhatsApp · /)).toBeVisible();
    await expect(page.getByLabel('Generator hours per day')).toHaveValue('6');

    // The driver's fuel card; the transfer is the last job.
    await page.goto(`/suppliers/${driverId}`);
    await expect(page.getByRole('heading', { name: 'Vehicle & fuel' })).toBeVisible();
    await expect(page.getByText('Transport · Matanzas')).toBeVisible();
    // The vehicle (D7(b)); the insurance ends within 30 days, so it is flagged.
    const insuranceUntil = new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10);
    await expect(async () => {
      await page.getByLabel('Model').fill('Peugeot 5008');
      await expect(page.getByLabel('Model')).toHaveValue('Peugeot 5008');
    }).toPass();
    await page.getByLabel('Seats').fill('7');
    await page.getByLabel('Plate').fill('P 207 913');
    await page.getByRole('checkbox', { name: 'Air conditioning' }).check();
    await page.getByLabel('Insurance until').fill(insuranceUntil);
    await page.getByLabel('Routes').fill('HAV ⇄ Viñales\nZapata');
    await page.getByRole('button', { name: 'Save vehicle' }).click();
    await expect(page.getByText(/Insurance ends in (9|10) d/)).toBeVisible();
    await expect(page.getByLabel('Routes')).toHaveValue('HAV ⇄ Viñales\nZapata');
    await expect(async () => {
      await page.getByLabel('Fuel reserve · litres').fill('40');
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(page.getByText(/Last confirmed .* · Phone · /)).toBeVisible();
    }).toPass();

    // The register: Power and Last job, and the backup-power filter.
    await page.goto('/suppliers');
    // The box follows the URL, so it ticks once the navigation lands.
    const backupOnly = page.getByRole('checkbox', { name: 'Backup power only' });
    await expect(async () => {
      await backupOnly.click();
      await expect(page).toHaveURL(/power=1/, { timeout: 2_000 });
    }).toPass();
    await expect(backupOnly).toBeChecked();
    const casaRow = page.getByRole('row', { name: new RegExp(CASA_NAME) });
    const driverRow = page.getByRole('row', { name: new RegExp(DRIVER_NAME) });
    await expect(casaRow).toContainText('Generator 6 h');
    await expect(driverRow).toContainText('Fuel 40 L');
    await expect(driverRow).toContainText('Transport · Matanzas');
    // A guide has no backup power, so the filter leaves it out.
    await expect(page.getByRole('row', { name: /Example Guide/ })).toHaveCount(0);

    // A case in Matanzas with the driver's trip attached.
    const response = await page.request.post('/api/ota/disruptions', {
      data: {
        scenario: 'outage',
        severity: 'MAJOR',
        province: 'CU04',
        title: TITLE,
        summary: 'Province-wide outage since last night.',
        reservationIds: [reservationId],
      },
    });
    expect(response.ok(), `create case → ${response.status()}`).toBeTruthy();
    const opened = (await response.json()) as { id: string };

    await page.goto(`/disruptions/${opened.id}`);
    await expect(page.getByText('Suppliers involved: 1')).toBeVisible();
    const card = page
      .locator('div')
      .filter({ has: page.getByRole('heading', { name: 'Resources in Matanzas' }) })
      .filter({ has: page.locator('dl') })
      .last();
    await expect(card.getByRole('link', { name: CASA_NAME })).toBeVisible();
    await expect(card).toContainText('generator 6 h/day (06–09, 18–21)');
    await expect(card).toContainText('fuel for 2 days');
    await expect(card.getByRole('link', { name: DRIVER_NAME })).toBeVisible();
    await expect(card).toContainText('fuel reserve 40 L · Matanzas');
  });
});
