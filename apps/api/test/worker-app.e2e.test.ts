import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * The worker app's downloads and updates (`docs/worker-app-distribution-plan.md`
 * U1a, U2a, U5a): everything is read from the release tool's folder, public,
 * and limited to the files the release lists.
 */
const APK_BYTES = Buffer.from('PK\u0003\u0004 not a real apk, but bytes to range over');
const FINGERPRINT = Array.from({ length: 32 }, () => 'AB').join(':');
const MANIFEST = JSON.stringify({ id: 'b1f6c0de-0000-4000-8000-000000000001' });
const SIGNATURE = 'sig="c2lnbmVk", keyid="main"';

const RELEASES = {
  apk: {
    versionName: '0.2.0',
    versionCode: 2,
    minVersionCode: 1,
    publishedAt: '2026-11-15T12:00:00.000Z',
    notes: 'Primera versión publicada',
    certificateSha256: FINGERPRINT,
    runtimeVersion: '0.2.0',
    nativeModules: { expo: '58.0.19' },
    apks: [
      {
        abi: 'arm64-v8a',
        versionCode: 22,
        file: 'vereda-0.2.0-arm64-v8a.apk',
        sizeBytes: APK_BYTES.length,
        sha256: 'a'.repeat(64),
      },
    ],
  },
  updates: {
    '0.2.0': {
      id: 'b1f6c0de-0000-4000-8000-000000000001',
      createdAt: '2026-11-15T13:00:00.000Z',
    },
  },
};

describe('worker app releases', () => {
  let app: INestApplication;
  let root: string;
  let dir: string;
  const previousDir = process.env.WORKER_APP_DIR;

  beforeAll(async () => {
    // Under a dot-directory, as in development (`apps/api/.worker-app`).
    root = await mkdtemp(join(tmpdir(), 'ota-worker-app-'));
    dir = join(root, '.worker-app');
    await mkdir(dir);
    process.env.WORKER_APP_DIR = dir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
    if (previousDir === undefined) delete process.env.WORKER_APP_DIR;
    else process.env.WORKER_APP_DIR = previousDir;
  });

  async function publish(releases: unknown = RELEASES) {
    await writeFile(join(dir, 'releases.json'), JSON.stringify(releases));
  }

  beforeEach(async () => {
    await mkdir(join(dir, 'apk'), { recursive: true });
    await writeFile(join(dir, 'apk', 'vereda-0.2.0-arm64-v8a.apk'), APK_BYTES);
    await writeFile(join(dir, 'apk', 'unlisted.apk'), APK_BYTES);
    const update = join(dir, 'updates', '0.2.0', RELEASES.updates['0.2.0'].id);
    await mkdir(join(update, 'assets'), { recursive: true });
    await writeFile(join(update, 'manifest.json'), MANIFEST);
    await writeFile(join(update, 'manifest.sig'), `${SIGNATURE}\n`);
    await writeFile(join(update, 'assets', 'bundle-abc.bundle'), 'bytecode');
  });

  afterEach(async () => {
    await rm(join(dir, 'releases.json'), { force: true });
  });

  it('serves no release before the first is published, with the download page', async () => {
    const response = await request(app.getHttpServer()).get('/worker-app/latest');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      downloadUrl: 'http://localhost:3000/app',
      release: null,
    });
  });

  it('serves the release without the server-side file names or native modules', async () => {
    await publish();
    const response = await request(app.getHttpServer()).get('/worker-app/latest');
    expect(response.body.release).toEqual({
      versionName: '0.2.0',
      versionCode: 2,
      minVersionCode: 1,
      publishedAt: '2026-11-15T12:00:00.000Z',
      notes: 'Primera versión publicada',
      certificateSha256: FINGERPRINT,
      apks: [
        {
          abi: 'arm64-v8a',
          versionCode: 22,
          sizeBytes: APK_BYTES.length,
          sha256: 'a'.repeat(64),
          path: '/worker-app/apk/vereda-0.2.0-arm64-v8a.apk',
        },
      ],
    });
  });

  it('treats a releases.json that does not parse as no release', async () => {
    await publish({ apk: { versionName: '0.2.0' }, updates: {} });
    const response = await request(app.getHttpServer()).get('/worker-app/latest');
    expect(response.body.release).toBeNull();
  });

  it('serves a listed APK, resuming from a byte range', async () => {
    await publish();
    const whole = await request(app.getHttpServer())
      .get('/worker-app/apk/vereda-0.2.0-arm64-v8a.apk')
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(whole.status).toBe(200);
    expect(whole.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(Buffer.compare(whole.body as Buffer, APK_BYTES)).toBe(0);

    const rest = await request(app.getHttpServer())
      .get('/worker-app/apk/vereda-0.2.0-arm64-v8a.apk')
      .set('Range', 'bytes=10-');
    expect(rest.status).toBe(206);
    expect(rest.headers['content-range']).toBe(
      `bytes 10-${APK_BYTES.length - 1}/${APK_BYTES.length}`,
    );
  });

  it('refuses a file the release does not list, and any path outside the folder', async () => {
    await publish();
    for (const path of [
      '/worker-app/apk/unlisted.apk',
      '/worker-app/apk/..%2Freleases.json',
      '/worker-app/updates/0.2.0/..%2F..%2F/assets/manifest.json',
      `/worker-app/updates/0.2.0/${RELEASES.updates['0.2.0'].id}/assets/..%2Fmanifest.json`,
    ]) {
      expect((await request(app.getHttpServer()).get(path)).status, path).toBe(404);
    }
  });

  it('answers the update check with the signed manifest, as the release tool wrote it', async () => {
    await publish();
    const response = await request(app.getHttpServer())
      .get('/worker-app/updates/manifest')
      .set('expo-platform', 'android')
      .set('expo-runtime-version', '0.2.0')
      .set('expo-protocol-version', '1')
      .buffer(true)
      .parse((res, done) => {
        let text = '';
        res.on('data', (chunk: Buffer) => (text += chunk.toString('utf8')));
        res.on('end', () => done(null, text));
      });
    expect(response.status).toBe(200);
    expect(response.headers['expo-protocol-version']).toBe('1');
    expect(response.headers['expo-sfv-version']).toBe('0');
    expect(response.headers['cache-control']).toBe('private, max-age=0');
    expect(response.headers['content-type']).toMatch(
      /^multipart\/mixed; boundary=[\w-]+$/,
    );
    const boundary = /boundary=([^;]+)/.exec(
      response.headers['content-type'] as string,
    )?.[1];
    expect(boundary).toBeTruthy();
    const body = response.body as string;
    const manifestPart = body.split(`--${boundary}`)[1]!;
    expect(manifestPart).toContain('content-disposition: form-data; name="manifest"');
    expect(manifestPart).toContain(`expo-signature: ${SIGNATURE}\r\n`);
    expect(manifestPart.endsWith(`\r\n\r\n${MANIFEST}\r\n`)).toBe(true);
    expect(body.endsWith(`--${boundary}--\r\n`)).toBe(true);
  });

  it('answers 204 when nothing is published for the phone’s runtime', async () => {
    await publish();
    const response = await request(app.getHttpServer())
      .get('/worker-app/updates/manifest')
      .set('expo-platform', 'android')
      .set('expo-runtime-version', '0.1.0');
    expect(response.status).toBe(204);
    expect(response.headers['expo-protocol-version']).toBe('1');
  });

  it('refuses an update check that is not from an Android app', async () => {
    const response = await request(app.getHttpServer())
      .get('/worker-app/updates/manifest')
      .set('expo-platform', 'ios')
      .set('expo-runtime-version', '0.2.0');
    expect(response.status).toBe(400);
  });

  it('serves an update’s asset for a year', async () => {
    await publish();
    const response = await request(app.getHttpServer()).get(
      `/worker-app/updates/0.2.0/${RELEASES.updates['0.2.0'].id}/assets/bundle-abc.bundle`,
    );
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['content-type']).toMatch(/^application\/javascript/);
  });
});
