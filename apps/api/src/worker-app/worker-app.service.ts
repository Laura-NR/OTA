import { readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import { Injectable, Logger } from '@nestjs/common';
import {
  workerAppPathSegmentSchema,
  workerAppReleasesSchema,
  type WorkerAppLatestDto,
  type WorkerAppReleases,
} from '@ota/schemas';

import { storefrontBaseUrl } from '../common/storefront-url';

/** The page approved workers are sent to (U1a: `https://app.<domain>` in production). */
export function workerAppPublicUrl(): string {
  return (process.env.WORKER_APP_PUBLIC_URL ?? `${storefrontBaseUrl()}/app`).replace(
    /\/$/,
    '',
  );
}

/** Where the release tool's folder is mounted (U2a). */
export function workerAppDir(): string {
  return resolve(process.env.WORKER_APP_DIR ?? join(process.cwd(), '.worker-app'));
}

const NO_RELEASE: WorkerAppReleases = { apk: null, updates: {} };

/** A signed expo-updates manifest, exactly as the release tool signed it. */
export interface SignedManifest {
  body: string;
  signature: string;
}

/**
 * The worker app's releases outside the stores (ADR 0007;
 * `docs/worker-app-distribution-plan.md` U2a, U5a). Everything comes from
 * the folder the release tool writes, read on each request so a release is
 * live once copied. The server holds no signing key: manifests arrive signed.
 */
@Injectable()
export class WorkerAppService {
  private readonly logger = new Logger(WorkerAppService.name);

  async latest(): Promise<WorkerAppLatestDto> {
    const { apk } = await this.releases();
    return {
      downloadUrl: workerAppPublicUrl(),
      release: apk && {
        versionName: apk.versionName,
        versionCode: apk.versionCode,
        minVersionCode: apk.minVersionCode,
        publishedAt: apk.publishedAt,
        notes: apk.notes,
        certificateSha256: apk.certificateSha256,
        apks: apk.apks.map((file) => ({
          abi: file.abi,
          versionCode: file.versionCode,
          sizeBytes: file.sizeBytes,
          sha256: file.sha256,
          path: `/worker-app/apk/${file.file}`,
        })),
      },
    };
  }

  /** The APK's path on disk, only for a file the current release lists. */
  async apkPath(file: string): Promise<string | null> {
    const { apk } = await this.releases();
    if (!apk?.apks.some((entry) => entry.file === file)) return null;
    return this.existing(join(workerAppDir(), 'apk', file));
  }

  /** The latest signed update for a runtime, or null when none is published. */
  async manifest(runtimeVersion: string): Promise<SignedManifest | null> {
    const { updates } = await this.releases();
    if (!workerAppPathSegmentSchema.safeParse(runtimeVersion).success) return null;
    const update = Object.hasOwn(updates, runtimeVersion)
      ? updates[runtimeVersion]
      : undefined;
    if (!update) return null;
    const folder = join(workerAppDir(), 'updates', runtimeVersion, update.id);
    const [body, signature] = await Promise.all([
      readFile(join(folder, 'manifest.json'), 'utf8'),
      readFile(join(folder, 'manifest.sig'), 'utf8'),
    ]);
    return { body, signature: signature.trim() };
  }

  /** An update's asset on disk; every segment is checked, so nothing leaves the folder. */
  async assetPath(
    runtimeVersion: string,
    updateId: string,
    file: string,
  ): Promise<string | null> {
    for (const segment of [runtimeVersion, updateId, file]) {
      if (!workerAppPathSegmentSchema.safeParse(segment).success) return null;
    }
    const assets = join(workerAppDir(), 'updates', runtimeVersion, updateId, 'assets');
    const path = resolve(assets, file);
    if (!path.startsWith(assets + sep)) return null;
    return this.existing(path);
  }

  private async existing(path: string): Promise<string | null> {
    try {
      return (await stat(path)).isFile() ? path : null;
    } catch {
      return null;
    }
  }

  /**
   * `releases.json`. No file means nothing is published yet; a file that does
   * not parse is logged and served as no release, so a bad copy never breaks
   * the app's start.
   */
  private async releases(): Promise<WorkerAppReleases> {
    let text: string;
    try {
      text = await readFile(join(workerAppDir(), 'releases.json'), 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return NO_RELEASE;
      throw error;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    const parsed = workerAppReleasesSchema.safeParse(json);
    if (!parsed.success) {
      this.logger.error(
        `releases.json in ${workerAppDir()} is invalid; serving no release`,
      );
      return NO_RELEASE;
    }
    return parsed.data;
  }
}
