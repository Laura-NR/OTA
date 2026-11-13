import { readFile } from 'node:fs/promises';

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
    await prisma.availability.deleteMany({ where: { supplierId } });
    await prisma.supplierResources.deleteMany({ where: { supplierId } });
    await prisma.supplierPayout.deleteMany({ where: { supplierId } });
    await prisma.auditLog.deleteMany({
      where: { entityId: supplierId, action: { startsWith: 'supplier.payout_' } },
    });
    await prisma.supplierProfile.update({
      where: { id: supplierId },
      data: { category: 'TOUR_GUIDE', payoutMethod: null },
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

    await app.getByRole('button', { name: 'Calendario y disponibilidad' }).click();
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
    await app.getByRole('button', { name: 'Fiabilidad y pagos' }).click();
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
    await app.getByRole('button', { name: 'Fiabilidad y pagos' }).click();
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
});
