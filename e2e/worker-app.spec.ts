import { PrismaClient } from '@ota/db';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/** The worker app's web preview (`pnpm --filter @ota/worker-app run preview`). */
const WORKER_APP_URL = process.env.E2E_WORKER_APP_URL ?? 'http://localhost:3003';
const BOOKING_CODE = 'E2EWRK01';

/** A worker of the spec's own, so no other spec's offer shows on their home. */
const WORKER = {
  email: 'e2e-worker@example.test',
  fullName: 'Reinier Prueba',
  phone: '+53 5999 0001',
  typed: '5999 0001',
};

let supplierId = '';
let serviceItemId = '';

/** Offers the fixture's guide item to the spec's worker, two hours to answer. */
async function offerToWorker(): Promise<void> {
  const { reservation, serviceItem } = await createDispatchableReservation(
    prisma,
    BOOKING_CODE,
  );
  serviceItemId = serviceItem.id;
  const offeredAt = new Date();
  const deadline = new Date(offeredAt.getTime() + 2 * 60 * 60 * 1000);
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: 'DISPATCH_IN_PROGRESS', partySize: 2 },
  });
  await prisma.serviceItem.update({
    where: { id: serviceItem.id },
    data: {
      supplierId,
      status: 'OFFERED',
      offeredAt,
      dispatchDeadline: deadline,
      payoutRate: '45.00',
    },
  });
  await prisma.dispatchOffer.create({
    data: { serviceItemId: serviceItem.id, supplierId, offeredAt, deadline },
  });
}

/** The desk's "Issue sign-in code…" on the worker's supplier page; returns the code. */
async function codeFromDesk(page: Page): Promise<string> {
  await signIn(page);
  await page.goto(`/suppliers/${supplierId}`);
  const dialog = page.getByRole('dialog', {
    name: `Sign-in code for ${WORKER.fullName}`,
  });
  // A client component: retry until hydration attaches the handler.
  await expect(async () => {
    await page.getByRole('button', { name: 'Issue sign-in code…' }).click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await expect(page.getByRole('heading', { name: 'Worker app sign-in' })).toBeVisible();
  await expect(
    dialog.getByText(`Check ${WORKER.fullName}’s ID card first.`),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Issue code' }).click();
  const code = (await dialog.locator('code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^\d{6}$/);
  await expect(dialog.getByText(/It works with \+53 5 999 •• 01 until/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Done' }).click();
  return code;
}

/** Signs in on the worker app at phone width, as a phone with no desk cookies. */
async function signInOnApp(browser: Browser, code: string): Promise<Page> {
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'es-ES',
    storageState: { cookies: [], origins: [] },
  });
  const app = await phone.newPage();
  await app.goto(WORKER_APP_URL);
  await app.getByLabel('Número de teléfono').fill(WORKER.typed);
  await app.getByRole('button', { name: 'Enviarme el código' }).click();
  await expect(
    app.getByText('Enviado por SMS al +53 5 999 •• 01.', { exact: false }),
  ).toBeVisible();
  await app.getByLabel('Código de 6 cifras').fill(code);
  await app.getByRole('button', { name: 'Confirmar' }).click();
  await expect(app.getByRole('heading', { name: 'Hola, Reinier' })).toBeVisible();
  return app;
}

test.describe('the worker app (Phase 7, docs/worker-app-plan.md)', () => {
  test.beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: WORKER.email },
      update: { deactivatedAt: null },
      create: {
        email: WORKER.email,
        fullName: WORKER.fullName,
        role: 'SERVICE_WORKER',
        locale: 'es',
        supplierProfile: {
          create: {
            category: 'TOUR_GUIDE',
            primaryPhone: WORKER.phone,
            provincesActive: ['La Habana'],
            rtnLicenseNumber: 'RTN-E2E-WORKER',
            verificationStatus: 'VERIFIED',
            credentialExpiresAt: new Date('2027-12-31T00:00:00Z'),
          },
        },
      },
      include: { supplierProfile: true },
    });
    supplierId = user.supplierProfile!.id;
  });

  test.beforeEach(async () => {
    await offerToWorker();
  });

  test.afterEach(async () => {
    await deleteReservationFixture(prisma, BOOKING_CODE);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: WORKER.email } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.verification.deleteMany({
      where: { identifier: `worker-code:${user.id}` },
    });
  });

  // The worker is an active guide in La Habana: left behind, it would be one
  // more eligible candidate in dispatch.spec.ts. Its offers went with the
  // reservation in afterEach; the supplier profile cascades.
  test.afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: WORKER.email } });
    await prisma.$disconnect();
  });

  test('signs in with a code the desk reads out and accepts the offer', async ({
    page,
    browser,
  }) => {
    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code);

    await expect(app.getByRole('heading', { name: '1 oferta esperando' })).toBeVisible();
    await expect(app.getByText('Credencial vigente · vence 31 dic 2027')).toBeVisible();
    await app.getByRole('button', { name: 'Responder ahora' }).click();
    await expect(app.getByText(BOOKING_CODE)).toBeVisible();
    await expect(app.getByText('Example +1 · inglés')).toBeVisible();
    await expect(app.getByText('€ 45 neto')).toBeVisible();
    await app.getByRole('button', { name: 'Aceptar el trabajo' }).click();

    await expect(app.getByText(/^Aceptado · \d\d:\d\d$/)).toBeVisible();
    await expect(app.getByText('Enviado.')).toBeVisible();
    const item = await prisma.serviceItem.findUniqueOrThrow({
      where: { id: serviceItemId },
    });
    expect(item.status).toBe('ACCEPTED');

    await app.getByRole('button', { name: 'Volver al inicio' }).click();
    await expect(app.getByRole('heading', { name: 'Ofertas' })).toBeVisible();
    await expect(app.getByText(`€ 45 · ${BOOKING_CODE}`, { exact: false })).toBeVisible();
    await app.context().close();
  });

  test('keeps a decline made with no signal and sends it when the signal returns', async ({
    page,
    browser,
  }) => {
    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code);

    await app.getByRole('button', { name: 'Responder ahora' }).click();
    await app.context().setOffline(true);
    await app.getByRole('button', { name: 'Rechazar…' }).click();
    await app.getByRole('radio', { name: 'Problema con el vehículo' }).click();
    await app.getByRole('button', { name: 'Confirmar rechazo' }).click();

    await expect(
      app.getByText('Rechazado · motivo: Problema con el vehículo'),
    ).toBeVisible();
    await expect(
      app.getByText('Guardado en el teléfono · se enviará solo cuando vuelva la señal.'),
    ).toBeVisible();
    let item = await prisma.serviceItem.findUniqueOrThrow({
      where: { id: serviceItemId },
    });
    expect(item.status).toBe('OFFERED');

    await app.getByRole('button', { name: 'Volver al inicio' }).click();
    await expect(app.getByText('Sin conexión · 1 pendiente')).toBeVisible();
    await app.context().setOffline(false);
    await app.getByRole('button', { name: 'Actualizar' }).click();
    await expect(app.getByText('Sincronizado')).toBeVisible();
    item = await prisma.serviceItem.findUniqueOrThrow({ where: { id: serviceItemId } });
    expect(item).toMatchObject({
      status: 'DECLINED',
      declineReason: 'Problema con el vehículo',
    });
    await app.context().close();
  });
});
