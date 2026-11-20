import { readFile } from 'node:fs/promises';

import { Prisma, PrismaClient } from '@ota/db';
import { expect, test, type Browser, type Page } from '@playwright/test';

import { createDispatchableReservation, deleteReservationFixture } from './fixtures';
import { signIn } from './helpers';

process.env.DATABASE_URL ??= 'postgresql://ota:ota@localhost:5432/ota_dev';
const prisma = new PrismaClient();

/** The worker app's web preview (`pnpm --filter @ota/worker-app run preview`). */
const WORKER_APP_URL = process.env.E2E_WORKER_APP_URL ?? 'http://localhost:3003';
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const BOOKING_CODE = 'E2EWRK01';

// A valid 1x1 PNG, as a phone's gallery would hand it to the web preview.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** A worker of the spec's own, so no other spec's offer shows on their home. */
const WORKER = {
  email: 'e2e-worker@example.test',
  fullName: 'Reinier Prueba',
  phone: '+53 5999 0001',
  typed: '5999 0001',
};

let supplierId = '';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
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

/**
 * A published APK newer than the preview's (version code 1), as
 * `GET /worker-app/latest` would serve it (docs/worker-app-distribution-plan.md U3a).
 */
function publishedRelease(minVersionCode: number) {
  return {
    downloadUrl: `${STOREFRONT_URL}/app`,
    release: {
      versionName: '0.2.0',
      versionCode: 2,
      minVersionCode,
      publishedAt: '2026-11-15T12:00:00.000Z',
      notes: 'Arreglos para el modo sin conexión.',
      certificateSha256: Array.from({ length: 32 }, () => 'AB').join(':'),
      apks: [
        {
          abi: 'arm64-v8a',
          versionCode: 22,
          sizeBytes: 34_200_000,
          sha256: 'a'.repeat(64),
          path: '/worker-app/apk/vereda-0.2.0-arm64-v8a.apk',
        },
      ],
    },
  };
}

/** A phone-width context with no desk cookies, seeing `release` as the published APK. */
async function phoneContext(
  browser: Browser,
  options: {
    geolocation?: { latitude: number; longitude: number; accuracy: number };
    release?: ReturnType<typeof publishedRelease>;
  } = {},
) {
  const { geolocation, release } = options;
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'es-ES',
    storageState: { cookies: [], origins: [] },
    ...(geolocation ? { geolocation, permissions: ['geolocation'] } : {}),
  });
  if (release) {
    await phone.route('**/worker-app/latest', (route) =>
      route.fulfill({ json: release }),
    );
  }
  return phone;
}

/**
 * Signs in on the worker app at phone width, as a phone with no desk cookies;
 * with `geolocation`, the phone has granted the position (W-Job J7); with
 * `release`, a newer APK is published.
 */
async function signInOnApp(
  browser: Browser,
  code: string,
  geolocation?: { latitude: number; longitude: number; accuracy: number },
  release?: ReturnType<typeof publishedRelease>,
): Promise<Page> {
  const phone = await phoneContext(browser, { geolocation, release });
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
    // W-Job: a report's audit rows name the incident, which goes with the booking.
    const incidents = await prisma.incident.findMany({
      where: { reservation: { bookingCode: BOOKING_CODE } },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { entityType: 'Incident', entityId: { in: incidents.map(({ id }) => id) } },
    });
    await deleteReservationFixture(prisma, BOOKING_CODE);
    await prisma.workerMessage.deleteMany({ where: { supplierId } });
    await prisma.availability.deleteMany({ where: { supplierId } });
    await prisma.supplierResources.deleteMany({ where: { supplierId } });
    await prisma.supplierPayout.deleteMany({ where: { supplierId } });
    await prisma.auditLog.deleteMany({
      where: { entityId: supplierId, action: { startsWith: 'supplier.payout_' } },
    });
    // W-Credentials: the documents, the expiry an approval rewrote, the status.
    await prisma.supplierCredential.deleteMany({ where: { supplierId } });
    await prisma.auditLog.deleteMany({
      where: {
        entityId: supplierId,
        OR: [
          { action: { startsWith: 'supplier.credential_' } },
          { action: { in: ['supplier.identity_checked', 'supplier.verification'] } },
          { action: { startsWith: 'supplier.vehicle_' } },
        ],
      },
    });
    await prisma.supplierProfile.update({
      where: { id: supplierId },
      data: {
        category: 'TOUR_GUIDE',
        vehicleDetails: Prisma.DbNull,
        payoutMethod: null,
        verificationStatus: 'VERIFIED',
        credentialExpiresAt: new Date('2027-12-31T00:00:00Z'),
      },
    });
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

  // docs/worker-app-distribution-plan.md U3a, U4a: the update prompt.
  test('offers a new version on the home, and a required one stands in front of sign-in', async ({
    page,
    browser,
  }) => {
    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code, undefined, publishedRelease(1));
    const card = app.getByText('Nueva versión 0.2.0');
    await expect(card).toBeVisible();
    await app.getByRole('button', { name: 'Ver la nueva versión' }).click();
    await expect(app.getByRole('heading', { name: 'Nueva versión 0.2.0' })).toBeVisible();
    await expect(app.getByText('34,2 MB · publicada el 15 nov 2026')).toBeVisible();
    await expect(app.getByText('Arreglos para el modo sin conexión.')).toBeVisible();
    // "Más tarde" hides it for a day, and the home is back.
    await app.getByRole('button', { name: 'Más tarde' }).click();
    await expect(app.getByRole('heading', { name: '1 oferta esperando' })).toBeVisible();
    await expect(card).toBeHidden();
    await app.context().close();

    // Below the minimum, the prompt replaces everything, sign-in included, with
    // no way to put it off; the preview's "Actualizar" opens the download page.
    const phone = await phoneContext(browser, { release: publishedRelease(2) });
    const blocked = await phone.newPage();
    await blocked.goto(WORKER_APP_URL);
    await expect(
      blocked.getByRole('heading', { name: 'Actualiza la app para seguir' }),
    ).toBeVisible();
    await expect(blocked.getByText(/La central pide la versión 0\.2\.0/)).toBeVisible();
    await expect(blocked.getByRole('button', { name: 'Más tarde' })).toHaveCount(0);
    await expect(blocked.getByLabel('Número de teléfono')).toHaveCount(0);
    const opened = phone.waitForEvent('page');
    await blocked.getByRole('button', { name: 'Actualizar' }).click();
    await expect(await opened).toHaveURL(`${STOREFRONT_URL}/app`);
    await phone.close();
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

  test('the desk signs a lost phone out and the app returns to sign-in', async ({
    page,
    browser,
  }) => {
    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code);

    const dialog = page.getByRole('dialog', {
      name: `Sign ${WORKER.fullName} out of the worker app`,
    });
    await page.getByRole('button', { name: 'Sign out of the worker app…' }).click();
    await expect(
      dialog.getByText('For a lost phone or one that changed hands.'),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      dialog.getByText(
        `1 phone was signed out. ${WORKER.fullName} needs a new code to sign in again.`,
      ),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: WORKER.email } });
    expect(
      await prisma.session.count({
        where: { userId: user.id, signInMethod: 'worker_code' },
      }),
    ).toBe(0);

    await app.getByRole('button', { name: 'Actualizar' }).click();
    await expect(app.getByText(/^Tu sesión terminó\./)).toBeVisible();
    await expect(app.getByLabel('Número de teléfono')).toBeVisible();
    await app.context().close();
  });

  test('blocks days with a reason and declares fuel in the calendar, and the desk sees the long block and why', async ({
    page,
    browser,
  }) => {
    // A driver, so the calendar shows the fuel card.
    await prisma.supplierProfile.update({
      where: { id: supplierId },
      data: { category: 'PRIVATE_DRIVER' },
    });
    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code);

    // Next month in Havana, past the fixture's offer (1–5 May 2027).
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Havana' }).format(
      new Date(),
    );
    const [year, month] = today.split('-').map(Number) as [number, number];
    let ahead = 1;
    const target = () => new Date(Date.UTC(year, month - 1 + ahead, 1));
    if (target().toISOString().startsWith('2027-05')) ahead = 2;
    const monthName = MONTHS[target().getUTCMonth()]!;
    const key = (day: number) =>
      new Date(Date.UTC(target().getUTCFullYear(), target().getUTCMonth(), day));
    const dayButton = (day: number) =>
      app.getByRole('button', { name: new RegExp(`^\\S+ ${day} de ${monthName}, `) });

    await app.getByRole('tab', { name: 'Calendario' }).click();
    await expect(app.getByRole('heading', { name: 'Calendario' })).toBeVisible();
    for (let step = 0; step < ahead; step += 1) {
      await app.getByRole('button', { name: 'Mes siguiente' }).click();
    }
    await expect(
      app.getByRole('heading', { name: new RegExp(`^${monthName} `, 'i') }),
    ).toBeVisible();

    // One day: block it ("Otro" until a reason is picked), say why, then free it again.
    const day20 = () =>
      prisma.availability.findUniqueOrThrow({
        where: { supplierId_date: { supplierId, date: key(20) } },
      });
    await dayButton(20).click();
    await app.getByRole('button', { name: 'Bloquear este día' }).click();
    await expect(app.getByText('1 día bloqueado.')).toBeVisible();
    await expect(dayButton(20)).toHaveAccessibleName(/, bloqueado \(otro\)$/);
    expect(await day20()).toMatchObject({ isAvailable: false, blockReason: 'OTHER' });
    const dayReasons = app.getByRole('radiogroup', {
      name: 'Motivo del bloqueo de este día',
    });
    await expect(
      dayReasons.getByRole('radio', { name: 'Otro', exact: true }),
    ).toBeChecked();
    await dayReasons.getByRole('radio', { name: 'Familia' }).click();
    await expect(app.getByText('Motivo guardado: Familia.')).toBeVisible();
    await expect(dayButton(20)).toHaveAccessibleName(/, bloqueado \(familia\)$/);
    expect(await day20()).toMatchObject({ isAvailable: false, blockReason: 'FAMILY' });
    await app.getByRole('button', { name: 'Volver a estar disponible' }).click();
    await expect(app.getByText('1 día disponible.')).toBeVisible();
    await expect(dayButton(20)).toHaveAccessibleName(/, disponible$/);
    expect(await day20()).toMatchObject({ isAvailable: true, blockReason: null });

    // Several days: pick "Desde" and "Hasta" on the grid; sixteen in a row is a long block.
    await app.getByRole('button', { name: /^Desde: / }).click();
    await dayButton(1).click();
    await dayButton(16).click();
    await app
      .getByRole('radiogroup', { name: 'Motivo de los días' })
      .getByRole('radio', { name: 'Carro en taller' })
      .click();
    await app.getByRole('button', { name: 'Bloquear 16 días' }).click();
    await expect(app.getByText('16 días bloqueados.')).toBeVisible();
    await expect(
      app.getByText(/^Tienes 16 días seguidos bloqueados, del 1 /),
    ).toBeVisible();
    expect(
      await prisma.availability.count({
        where: { supplierId, isAvailable: false, blockReason: 'VEHICLE_REPAIR' },
      }),
    ).toBe(16);

    // The driver's weekly fuel declaration.
    await expect(app.getByText('sin declarar')).toBeVisible();
    await app.getByLabel('Litros en reserva').fill('40');
    await app.getByRole('button', { name: 'Actualizar' }).click();
    await expect(app.getByText(/^actualizado hoy \d\d:\d\d$/)).toBeVisible();
    expect(
      await prisma.supplierResources.findUniqueOrThrow({ where: { supplierId } }),
    ).toMatchObject({ fuelReserveLitres: 40, confirmedVia: 'WORKER_APP' });

    await page.reload();
    await expect(page.getByText('16 days blocked in a row')).toBeVisible();
    await expect(
      page.getByText(
        /Dispatch skips the worker on those days; call them before high season\./,
      ),
    ).toBeVisible();
    // The desk's calendar opens on this month (UTC) and names the worker's reason.
    const now = new Date();
    const steps =
      (target().getUTCFullYear() - now.getUTCFullYear()) * 12 +
      target().getUTCMonth() -
      now.getUTCMonth();
    for (let step = 0; step < steps; step += 1) {
      await page.getByRole('button', { name: '→', exact: true }).click();
    }
    const deskDay = page.locator(`[data-date="${key(5).toISOString().slice(0, 10)}"]`);
    await expect(deskDay).toHaveAttribute('title', 'Blocked · Vehicle in the garage');
    await app.context().close();
  });

  test('shows the worker their reliability, payouts and finished jobs, and the desk the same payouts', async ({
    page,
    browser,
  }) => {
    // The offer, accepted and done an hour ago, still to be paid; a second
    // job on the same booking, already paid.
    const endedAt = new Date(Date.now() - 60 * 60 * 1000);
    const startedAt = new Date(endedAt.getTime() - 3 * 60 * 60 * 1000);
    const offered = await prisma.serviceItem.update({
      where: { id: serviceItemId },
      data: {
        status: 'ACCEPTED',
        serviceDateStart: startedAt,
        serviceDateEnd: endedAt,
        respondedAt: startedAt,
        payoutStatus: 'ACCRUED',
      },
    });
    await prisma.dispatchOffer.updateMany({
      where: { serviceItemId },
      data: { status: 'ACCEPTED', respondedAt: startedAt },
    });
    await prisma.serviceItem.create({
      data: {
        reservationId: offered.reservationId,
        supplierId,
        serviceType: 'TRANSPORTATION',
        province: 'La Habana',
        serviceDateStart: startedAt,
        serviceDateEnd: endedAt,
        status: 'ACCEPTED',
        payoutRate: '30.50',
        payoutStatus: 'SETTLED',
      },
    });

    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code);
    await app.getByRole('tab', { name: 'Perfil' }).click();
    await expect(app.getByRole('heading', { name: 'Fiabilidad y pagos' })).toBeVisible();
    await expect(app.getByText('Reinier Prueba · Guía · La Habana')).toBeVisible();

    // One answer is not enough for a score; automatic offers keep coming.
    await expect(app.getByText('Recibes ofertas automáticas')).toBeVisible();
    await expect(
      app.getByText('Aún no hay número: llevas 1 de 5 respuestas.'),
    ).toBeVisible();

    // € 45 is the pending total and the history row; € 30,50 the paid total and its row.
    await expect(app.getByText('€ 45', { exact: true })).toHaveCount(2);
    await expect(app.getByText('1 trabajo terminado')).toBeVisible();
    const year = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana',
      year: 'numeric',
    }).format(endedAt);
    await expect(app.getByText(`Pagado en ${year}`)).toBeVisible();
    await expect(app.getByText('€ 30,50', { exact: true })).toHaveCount(2);

    // Both jobs in the history, each with where its payout stands.
    await expect(
      app.getByText(`Example +1 · inglés · ${BOOKING_CODE}`, { exact: true }),
    ).toHaveCount(2);
    await expect(app.getByText('Pagado', { exact: true })).toHaveCount(1);
    await expect(app.getByText('Pendiente', { exact: true })).toHaveCount(2);

    await page.reload();
    const payouts = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Payouts', exact: true }) })
      .last();
    await expect(payouts.getByText('Pending', { exact: true })).toBeVisible();
    // The pending tile and the job's row under Record payout.
    await expect(payouts.getByText('€45.00', { exact: true })).toHaveCount(2);
    await expect(payouts.getByText(`Paid in ${year}`)).toBeVisible();
    await expect(payouts.getByText('€30.50')).toBeVisible();
    await expect(payouts.getByText('1 job', { exact: true })).toHaveCount(2);
    await app.context().close();
  });

  test('the desk records a payout with its receipt and the worker reads it with the next pay day', async ({
    page,
    browser,
  }) => {
    // The offer, accepted and done an hour ago (€ 45), and a second job that
    // stays pending (€ 20), so the app has a next pay day to show.
    const endedAt = new Date(Date.now() - 60 * 60 * 1000);
    const startedAt = new Date(endedAt.getTime() - 3 * 60 * 60 * 1000);
    const offered = await prisma.serviceItem.update({
      where: { id: serviceItemId },
      data: {
        status: 'ACCEPTED',
        serviceDateStart: startedAt,
        serviceDateEnd: endedAt,
        respondedAt: startedAt,
      },
    });
    await prisma.serviceItem.create({
      data: {
        reservationId: offered.reservationId,
        supplierId,
        serviceType: 'TRANSPORTATION',
        province: 'La Habana',
        serviceDateStart: startedAt,
        serviceDateEnd: endedAt,
        status: 'ACCEPTED',
        payoutRate: '20.00',
      },
    });

    const code = await codeFromDesk(page);
    const payouts = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Payouts', exact: true }) })
      .last();
    await expect(payouts.getByText(/^Method not set · /)).toBeVisible();
    await expect(payouts.getByText('No payment recorded yet.')).toBeVisible();

    // Cash at the office, then pay the € 45 job alone.
    await expect(async () => {
      await payouts.getByLabel('Payout method').selectOption('CASH_OFFICE');
      await payouts.getByRole('button', { name: 'Save method' }).click();
      await expect(payouts.getByText(/^Cash at the office · oficina Vedado/)).toBeVisible(
        {
          timeout: 2_000,
        },
      );
    }).toPass();
    await payouts.getByRole('checkbox', { name: /€45\.00/ }).check();
    await payouts.getByRole('button', { name: 'Record €45.00 for 1 job' }).click();

    const receipt = payouts.getByRole('link', { name: 'Receipt (PDF)' });
    await expect(receipt).toBeVisible();
    await expect(payouts.getByRole('checkbox', { name: /€45\.00/ })).toHaveCount(0);
    await expect(payouts.getByRole('checkbox', { name: /€20\.00/ })).toBeVisible();
    const pdf = await page.request.get((await receipt.getAttribute('href'))!);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [year, month, day] = today.split('-').map(Number) as [number, number, number];
    const paidOn = `${day} ${MONTHS[month - 1]!.slice(0, 3)}`;

    const app = await signInOnApp(browser, code);
    await app.getByRole('tab', { name: 'Perfil' }).click();
    await expect(app.getByText('Efectivo EUR · oficina Vedado')).toHaveCount(2);
    // The € 20 job is due five business days after it ended, paid on a Saturday.
    await expect(app.getByText('Próximo pago')).toBeVisible();
    await expect(
      app.getByText(/^Sáb \d{1,2} [a-z]{3} 10:00–13:00 · trae tu carnet$/),
    ).toBeVisible();
    await expect(app.getByText(`Pagado en ${year}`)).toBeVisible();
    await expect(app.getByText(`Pagado ${paidOn}`, { exact: true })).toBeVisible();
    await expect(app.getByText('Pendiente', { exact: true })).toHaveCount(2);
    await expect(app.getByRole('heading', { name: 'Recibos (PDF)' })).toBeVisible();
    await expect(app.getByText(paidOn, { exact: true })).toBeVisible();
    await expect(
      app.getByText('Efectivo EUR · oficina Vedado · 1 trabajo'),
    ).toBeVisible();

    // E5: the worker keeps a copy of the receipt they signed (the preview
    // saves it where the phone hands it to the share sheet).
    const [download] = await Promise.all([
      app.waitForEvent('download'),
      app.getByRole('button', { name: `Abrir el recibo del ${paidOn}` }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^recibo-PG-[0-9A-F]{8}\.pdf$/);
    const copy = await readFile((await download.path())!);
    expect(copy.subarray(0, 5).toString()).toBe('%PDF-');
    await app.context().close();
  });

  test('sends a photo of a document from the app, the desk approves it, and approval needs every document', async ({
    page,
    browser,
  }) => {
    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code);

    await app.getByRole('button', { name: 'Mis credenciales' }).click();
    await expect(app.getByRole('heading', { name: 'Mis credenciales' })).toBeVisible();
    await expect(app.getByRole('heading', { name: 'Licencia de guía' })).toBeVisible();
    await expect(
      app.getByText('Comprobado por la central', { exact: false }),
    ).toHaveCount(0);
    await app.getByRole('button', { name: 'Subir la foto: Licencia de guía' }).click();
    const chooser = app.waitForEvent('filechooser');
    await app.getByRole('button', { name: 'Elegir de la galería' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'licencia.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_1X1, 'base64'),
    });
    await expect(app.getByLabel('Foto de Licencia de guía')).toBeVisible();
    await expect(
      app.getByText('Sin reflejos sobre el número', { exact: false }),
    ).toBeVisible();
    await app.getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(app.getByText('Enviada · en revisión')).toBeVisible();
    const pending = await prisma.supplierCredential.findFirstOrThrow({
      where: { supplierId, kind: 'GUIDE_LICENCE', status: 'PENDING_AUDIT' },
    });
    expect(pending.uploadedVia).toBe('WORKER_APP');

    // The desk reviews it: the file only on request, then approve with the expiry.
    await page.reload();
    const approve = page.getByRole('form', { name: 'Approve Guide licence' });
    await expect(page.getByText('Pending audit', { exact: true })).toBeVisible();
    await expect(async () => {
      await page.getByRole('button', { name: 'Show document (logged)' }).click();
      await expect(page.getByAltText('Guide licence, uploaded document')).toBeVisible({
        timeout: 2_000,
      });
    }).toPass();
    await approve.getByLabel('Number').fill('GUIA-HAB-2026-0042');
    await approve.getByLabel(/^Expires/).fill('2028-06-12');
    await approve.getByRole('button', { name: 'Approve · VERIFIED' }).click();
    await expect(page.getByText('Pending audit', { exact: true })).toHaveCount(0);
    await expect(page.getByText('GUIA-HAB-2026-0042')).toBeVisible();
    const profile = await prisma.supplierProfile.findUniqueOrThrow({
      where: { id: supplierId },
    });
    expect(profile.credentialExpiresAt).toEqual(new Date('2028-06-12T00:00:00Z'));
    expect(
      await prisma.auditLog.count({
        where: { entityId: supplierId, action: 'supplier.credential_viewed' },
      }),
    ).toBeGreaterThan(0);

    // The app shows the verified licence once reopened.
    await app.getByRole('button', { name: 'Volver al inicio' }).click();
    await app.getByRole('button', { name: 'Mis credenciales' }).click();
    await expect(app.getByText('Número GUIA-HAB-2026-0042')).toBeVisible();
    await expect(app.getByText(/^Vence 12 jun 2028 · \d+ días$/)).toBeVisible();
    await expect(app.getByText('Verificada', { exact: true })).toBeVisible();

    // Approval needs every document: the identity card is still unchecked.
    await page.getByRole('button', { name: 'Suspend' }).click();
    await expect(
      page.getByText('Verify these documents before approving: Identity card.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reinstate' }).click();
    await expect(
      page.getByText(/Verify these documents before approving the supplier/),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Record checked in person' }).click();
    await expect(
      page.getByText(/Checked in person on .+\. No photo is kept\./),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Reinstate' }).click();
    await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();
    expect(
      (await prisma.supplierProfile.findUniqueOrThrow({ where: { id: supplierId } }))
        .verificationStatus,
    ).toBe('VERIFIED');
    await app.context().close();
  });

  test('a driver asks to change vehicle from the app and the desk approves it (docs/schema-w-vehicle.md)', async ({
    page,
    browser,
  }) => {
    await prisma.supplierProfile.update({
      where: { id: supplierId },
      data: {
        category: 'PRIVATE_DRIVER',
        vehicleDetails: {
          model: 'Peugeot 5008',
          seats: 7,
          airConditioning: true,
          extras: null,
          plate: 'P 207 913',
          insurance: 'Civil liability',
          routes: ['Zapata'],
        },
      },
    });
    const reviewedAt = new Date();
    await prisma.supplierCredential.createMany({
      data: (['LIABILITY_INSURANCE', 'TECHNICAL_INSPECTION'] as const).map((kind) => ({
        supplierId,
        kind,
        status: 'VERIFIED' as const,
        expiresOn: new Date('2027-09-30T00:00:00Z'),
        uploadedVia: 'VISIT' as const,
        reviewedAt,
      })),
    });
    const code = await codeFromDesk(page);
    const app = await signInOnApp(browser, code);

    await app.getByRole('button', { name: 'Mis credenciales' }).click();
    await expect(
      app.getByText('Vehículo Peugeot 5008 · P 207 913 · 7 plazas · aire acondicionado'),
    ).toBeVisible();
    await app.getByRole('button', { name: 'Cambiar de vehículo' }).click();
    await app.getByLabel('Modelo').fill('Hyundai H1');
    await app.getByLabel('Matrícula').fill('P 311 004');
    await app.getByLabel('Plazas').fill('9');
    await app.getByRole('button', { name: 'Enviar a la central' }).click();
    await expect(app.getByText('Cambio de vehículo en revisión')).toBeVisible();
    // The current vehicle stays on file until the desk approves.
    await expect(app.getByText('Vehículo Peugeot 5008', { exact: false })).toBeVisible();

    // The desk sees the request on the vehicle card and approves the new plate.
    await page.reload();
    const request = page.getByRole('region', {
      name: 'Vehicle change asked from the app',
    });
    await expect(request).toContainText(
      'Hyundai H1 · P 311 004 · 9 seats · air conditioning',
    );
    const dialog = page.getByRole('dialog', { name: 'Approve Hyundai H1 · P 311 004?' });
    await expect(async () => {
      await request.getByRole('button', { name: 'Review and approve…' }).click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await expect(dialog).toContainText('The plate changes from P 207 913 to P 311 004');
    await dialog.getByRole('button', { name: 'Approve vehicle' }).click();
    await expect(request).toHaveCount(0);
    await expect(page.getByLabel('Model')).toHaveValue('Hyundai H1');
    await expect(page.getByText('No verified insurance')).toBeVisible();
    const documents = await prisma.supplierCredential.findMany({
      where: { supplierId },
      select: { kind: true, status: true },
    });
    expect(documents.map(({ status }) => status)).toEqual(['SUPERSEDED', 'SUPERSEDED']);

    // The app asks for the new car's insurance and inspection.
    await app.getByRole('button', { name: 'Volver al inicio' }).click();
    await app.getByRole('button', { name: 'Mis credenciales' }).click();
    await expect(
      app.getByText('Vehículo Hyundai H1 · P 311 004 · 9 plazas · aire acondicionado'),
    ).toBeVisible();
    await expect(
      app.getByRole('button', { name: 'Subir la foto: Seguro de responsabilidad civil' }),
    ).toBeVisible();
    await expect(
      app.getByRole('button', { name: 'Subir la foto: Inspección técnica (somatón)' }),
    ).toBeVisible();
    await expect(app.getByText('Cambio de vehículo en revisión')).toHaveCount(0);
    await app.context().close();
  });

  test('W-Job: the brief, a step sent after the signal returns, the SOS on the desk', async ({
    page,
    browser,
  }) => {
    // The offered guide job, taken an hour ago, today, on a paid booking.
    const now = Date.now();
    const item = await prisma.serviceItem.update({
      where: { id: serviceItemId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(now - 60 * 60 * 1000),
        serviceDateStart: new Date(now - 30 * 60 * 1000),
        serviceDateEnd: new Date(now + 3 * 60 * 60 * 1000),
      },
    });
    await prisma.reservation.update({
      where: { id: item.reservationId },
      data: { status: 'CONFIRMED' },
    });

    // The desk writes the brief on the booking.
    const code = await codeFromDesk(page);
    await page.goto(`/bookings/${item.reservationId}`);
    const brief = page.getByRole('dialog', { name: 'Brief for the worker' });
    await expect(async () => {
      await page.getByRole('button', { name: /^Brief for the worker · / }).click();
      await expect(brief).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await brief.getByLabel('Meeting point').fill('Hotel Inglaterra, recepción');
    await brief.getByLabel('Notes for the worker').fill('Cartel «Vereda · Prueba»');
    await brief.getByRole('button', { name: 'Save brief' }).click();
    await expect(brief).toBeHidden();
    await expect(page.getByText('Brief written')).toBeVisible();

    // The worker opens the job and reads it.
    const app = await signInOnApp(browser, code, {
      latitude: 23.113612,
      longitude: -82.366581,
      accuracy: 12,
    });
    await app.getByRole('button', { name: /^Ver el trabajo: E2EWRK01/ }).click();
    await expect(app.getByRole('heading', { name: 'Trabajo de hoy' })).toBeVisible();
    await expect(app.getByText('Hotel Inglaterra, recepción')).toBeVisible();
    await expect(app.getByText('Cartel «Vereda · Prueba»')).toBeVisible();

    // With no signal the step waits on the phone, then goes once it returns.
    await app.context().setOffline(true);
    await app.getByRole('button', { name: 'Salgo ahora' }).click();
    await expect(app.getByText(/^Guardado · \d\d:\d\d · se enviará/)).toBeVisible();
    await app.context().setOffline(false);
    await expect(app.getByText(/^Hecho · \d\d:\d\d$/)).toBeVisible({ timeout: 30_000 });
    // The state line and the step's own name.
    await expect(app.getByText('En camino', { exact: true })).toHaveCount(2);

    // The emergency, with the phone's position.
    await app.getByRole('button', { name: 'Reportar emergencia en el lugar' }).click();
    await app
      .getByRole('radio', { name: 'Mecánica · el vehículo no puede seguir' })
      .click();
    await app
      .getByRole('button', { name: 'Avisar a la central con mi ubicación' })
      .click();
    await expect(app.getByText(/^Central avisada · \d\d:\d\d · mecánica$/)).toBeVisible();
    await expect(app.getByText('La central te llamará.', { exact: false })).toBeVisible();
    const incident = await prisma.incident.findFirstOrThrow({
      where: { serviceItemId },
    });
    expect(incident).toMatchObject({ source: 'WORKER_APP', category: 'MECHANICAL' });

    // The desk sees the red alert on the booking, with the position, and takes it.
    await page.reload();
    const alert = page.getByRole('listitem').filter({
      hasText: 'On-site emergency · E2EWRK01',
    });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Reinier Prueba reported an emergency at');
    await expect(alert).toContainText('mechanical');
    await expect(alert).toContainText('Position 23.11361, -82.36658 ± 12 m');
    await expect(
      alert.getByRole('link', { name: 'Call Reinier Prueba' }),
    ).toHaveAttribute('href', 'tel:+5359990001');
    await expect(page.getByText(/^On the way · \d\d:\d\d$/)).toBeVisible();
    await alert
      .getByRole('button', { name: 'I have it · emergency on E2EWRK01' })
      .click();
    await expect(alert).toBeHidden();
    await expect(
      page.getByText(/Worker’s app · Reported by Reinier Prueba/),
    ).toBeVisible();
    await expect(page.getByText(/Acknowledged by .* at \d\d:\d\d/)).toBeVisible();

    // A step phoned in: the desk records the end of the tour.
    const stepDialog = page.getByRole('dialog', { name: 'Record a step from a call' });
    await page.getByRole('button', { name: /^Record a step · / }).click();
    await stepDialog.getByLabel('Step').selectOption({ label: 'Finished' });
    await stepDialog.getByRole('button', { name: 'Record step' }).click();
    await expect(stepDialog).toBeHidden();
    await expect(page.getByText(/^Finished · \d\d:\d\d$/)).toBeVisible();
    expect(
      (await prisma.serviceItem.findUniqueOrThrow({ where: { id: serviceItemId } }))
        .status,
    ).toBe('FULFILLED');

    // The traveler's trip page says so.
    await signIn(page, 'traveler@example.test', {
      origin: STOREFRONT_URL,
      callbackPath: `/en/account/reservations/${item.reservationId}`,
    });
    await expect(page.getByText(/^Tour finished · \d\d:\d\d( [AP]M)?$/)).toBeVisible();
  });

  test('worker messages: the desk writes from the booking, the worker answers with no signal, AL-Inbox shows it', async ({
    page,
    browser,
  }) => {
    // The offered guide job, taken an hour ago, running today.
    const now = Date.now();
    const item = await prisma.serviceItem.update({
      where: { id: serviceItemId },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(now - 60 * 60 * 1000),
        serviceDateStart: new Date(now - 30 * 60 * 1000),
        serviceDateEnd: new Date(now + 3 * 60 * 60 * 1000),
      },
    });
    await prisma.reservation.update({
      where: { id: item.reservationId },
      data: { status: 'CONFIRMED' },
    });

    // The desk writes to the worker from the booking's "Worker threads".
    const code = await codeFromDesk(page);
    await page.goto(`/bookings/${item.reservationId}`);
    const card = page.getByRole('region', { name: 'Worker threads' });
    await expect(card.getByText('No message about this booking yet.')).toBeVisible();
    const toDesk = card.getByRole('textbox', { name: 'Write to Reinier' });
    await expect(async () => {
      const toggle = card.getByRole('button', { name: /^(Open|Close) thread$/ });
      if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
      await expect(toDesk).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await toDesk.fill('¿Cartel listo? Ingrid lleva bastón.');
    await card.getByRole('button', { name: 'Send' }).click();
    await expect(
      card.getByRole('list', { name: 'Messages' }).getByText('¿Cartel listo?', {
        exact: false,
      }),
    ).toBeVisible();

    // The worker reads it on the home, which marks it read.
    const app = await signInOnApp(browser, code);
    await expect(app.getByText('Mensaje de la central')).toBeVisible();
    await expect(app.getByText('¿Cartel listo? Ingrid lleva bastón.')).toBeVisible();
    await app.getByRole('button', { name: 'Leer y responder' }).click();
    await expect(
      app.getByRole('heading', { name: 'Mensajes con la central' }),
    ).toBeVisible();
    await expect
      .poll(async () =>
        prisma.workerMessage.count({
          where: { supplierId, sender: 'OPERATIONS', readAt: null },
        }),
      )
      .toBe(0);

    // From the job, with no signal: the answer waits on the phone, then goes.
    await app.getByRole('button', { name: '‹ Volver' }).click();
    await app.getByRole('button', { name: /^Ver el trabajo: E2EWRK01/ }).click();
    await app.getByRole('button', { name: 'Mensaje a la central' }).click();
    await expect(app.getByText('Sobre el trabajo E2EWRK01')).toBeVisible();
    await app.context().setOffline(true);
    await app
      .getByRole('textbox', { name: 'Mensaje a la central' })
      .fill('Listo, salgo a las 15:30.');
    await app.getByRole('button', { name: 'Enviar' }).click();
    await expect(app.getByText(/^Tú · .* · en cola$/)).toBeVisible();
    await app.context().setOffline(false);
    await expect(app.getByText(/^Tú · .* · enviado$/)).toBeVisible({ timeout: 30_000 });
    const answer = await prisma.workerMessage.findFirstOrThrow({
      where: { supplierId, sender: 'WORKER' },
    });
    expect(answer).toMatchObject({ serviceItemId, body: 'Listo, salgo a las 15:30.' });
    expect(answer.writtenAt!.getTime()).toBeLessThanOrEqual(answer.createdAt.getTime());

    // AL-Inbox lists it under Workers, urgent: about today's job, awaiting a reply.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/lite/inbox');
    await page.getByRole('button', { name: /^Workers/ }).click();
    const thread = page.getByRole('button').filter({ hasText: 'Reinier Prueba' });
    await expect(thread).toContainText('Listo, salgo a las 15:30.');
    await expect(thread).toContainText('Urgent');
    await expect(thread).toContainText('Worker · TOUR GUIDE');
    await expect(async () => {
      await thread.click({ timeout: 1_000 });
      await expect(thread).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
    }).toPass();
    await expect(page.getByRole('heading', { name: 'Reinier Prueba' })).toBeVisible();
    await expect
      .poll(async () =>
        prisma.workerMessage.count({
          where: { supplierId, sender: 'WORKER', readAt: null },
        }),
      )
      .toBe(0);

    // The booking's card shows the answer about it.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/bookings/${item.reservationId}`);
    await expect(card).toContainText('“Listo, salgo a las 15:30.”');
  });
});
