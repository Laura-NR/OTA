import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { signIn } from './helpers';

/**
 * The worker app's distribution (docs/worker-app-distribution-plan.md U1a,
 * U2a, U6a, U7a): the download page reads the release the tool published,
 * serves the APKs, and the desk prints the card. The dev API reads its
 * releases from apps/api/.worker-app (WORKER_APP_DIR unset).
 */
const STOREFRONT_URL = process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000';
const DIR = resolve('apps', 'api', '.worker-app');
const APK = Buffer.from('PK\u0003\u0004 an e2e stand-in for the arm64 split');
const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  (index % 16).toString(16).toUpperCase().padStart(2, '0'),
).join(':');

// Version code 1 is the web preview's own, so worker-app.spec.ts sees no prompt.
const RELEASES = {
  apk: {
    versionName: '0.1.0',
    versionCode: 1,
    minVersionCode: 1,
    publishedAt: '2026-11-15T12:00:00.000Z',
    notes: null,
    certificateSha256: FINGERPRINT,
    runtimeVersion: '0.1.0',
    nativeModules: { expo: '58.0.19' },
    apks: [
      {
        abi: 'arm64-v8a',
        versionCode: 12,
        file: 'e2e-0.1.0-arm64-v8a.apk',
        sizeBytes: APK.length,
        sha256: 'a'.repeat(64),
      },
      {
        abi: 'armeabi-v7a',
        versionCode: 11,
        file: 'e2e-0.1.0-armeabi-v7a.apk',
        sizeBytes: APK.length,
        sha256: 'b'.repeat(64),
      },
    ],
  },
  updates: {},
};

let previous: string | null = null;

test.describe('worker app distribution', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    previous = await readFile(join(DIR, 'releases.json'), 'utf8').catch(() => null);
    await mkdir(join(DIR, 'apk'), { recursive: true });
    for (const apk of RELEASES.apk.apks) await writeFile(join(DIR, 'apk', apk.file), APK);
    await writeFile(join(DIR, 'releases.json'), JSON.stringify(RELEASES));
  });

  test.afterAll(async () => {
    for (const apk of RELEASES.apk.apks) {
      await rm(join(DIR, 'apk', apk.file), { force: true });
    }
    if (previous === null) await rm(join(DIR, 'releases.json'), { force: true });
    else await writeFile(join(DIR, 'releases.json'), previous);
  });

  test('the download page shows the release, its certificate and the APKs', async ({
    browser,
  }) => {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'es-ES',
      storageState: { cookies: [], origins: [] },
    });
    const page = await phone.newPage();
    await page.goto(`${STOREFRONT_URL}/app`);
    await expect(
      page.getByRole('heading', { name: 'App de colaboradores' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Versión 0.1.0' })).toBeVisible();
    await expect(page.getByText('publicada el 15 de noviembre de 2026')).toBeVisible();
    await expect(page.getByTestId('certificate')).toHaveText(FINGERPRINT);
    await expect(page.getByText('Solo para Android')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Cómo instalarla' })).toBeVisible();
    await expect(page.getByText(/Play Protect/)).toBeVisible();

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Descargar la app' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('e2e-0.1.0-arm64-v8a.apk');
    expect(Buffer.compare(await readFile((await file.path())!), APK)).toBe(0);
    await expect(
      page.getByRole('link', { name: /Descarga la versión de 32 bits/ }),
    ).toHaveAttribute('href', '/api/ota/worker-app/apk/e2e-0.1.0-armeabi-v7a.apk');

    // A cut download resumes: the rewrite passes the range through.
    const rest = await page.request.get(
      `${STOREFRONT_URL}/api/ota/worker-app/apk/e2e-0.1.0-arm64-v8a.apk`,
      { headers: { Range: 'bytes=4-' } },
    );
    expect(rest.status()).toBe(206);
    expect(Buffer.compare(await rest.body(), APK.subarray(4))).toBe(0);
    await phone.close();
  });

  test('an iPhone learns the app is Android only', async ({ browser }) => {
    const iphone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'es-ES',
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      storageState: { cookies: [], origins: [] },
    });
    const page = await iphone.newPage();
    await page.goto(`${STOREFRONT_URL}/app`);
    await expect(page.getByText('Solo para Android')).toBeVisible();
    await iphone.close();
  });

  test('the desk prints the card with the link and the release', async ({ page }) => {
    await signIn(page);
    await page.goto('/suppliers/applications');
    await page.getByRole('link', { name: 'Worker app card' }).click();
    await expect(page.getByRole('heading', { name: 'Worker app card' })).toBeVisible();
    await expect(page.getByText(`${STOREFRONT_URL}/app`, { exact: true })).toBeVisible();
    await expect(
      page.getByText('Version 0.1.0, published November 15, 2026'),
    ).toBeVisible();
    await expect(page.getByText(FINGERPRINT)).toBeVisible();
    // The demo tenant has no QR image yet; the desk is told how to add one.
    await expect(page.getByText(/tenant\/assets\/worker-app\/qr\.svg/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
  });
});
