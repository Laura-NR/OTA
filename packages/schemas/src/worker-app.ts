import { z } from 'zod';

/**
 * The worker app's releases (ADR 0007; `docs/worker-app-distribution-plan.md`
 * U2a). `releases.json` is written by `tools/worker-app-release.mjs` on the
 * machine that builds the APK; the API reads it from `WORKER_APP_DIR`.
 */
export const workerAppAbiSchema = z.enum(['arm64-v8a', 'armeabi-v7a']);

/** A file name the API may serve: no directory, no dot-dot. */
const releaseFileNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/);

/** An expo-updates runtime version or update id as a path segment. */
export const workerAppPathSegmentSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** The signing certificate's SHA-256, as `apksigner` and `keytool` print it. */
const certificateFingerprintSchema = z.string().regex(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);

export const workerAppReleasesSchema = z.object({
  apk: z
    .object({
      versionName: z.string().min(1),
      /** The release's code; each split's Android code is this × 10 + its digit. */
      versionCode: z.number().int().positive(),
      /** Below this the update is required (U3a). */
      minVersionCode: z.number().int().positive(),
      publishedAt: z.string().datetime(),
      notes: z.string().nullable(),
      certificateSha256: certificateFingerprintSchema,
      /** The expo-updates runtime the APK runs; JS updates must match it (U5a). */
      runtimeVersion: workerAppPathSegmentSchema,
      /** The native modules it was built with (`workerAppNativeModules`). */
      nativeModules: z.record(z.string(), z.string()),
      apks: z
        .array(
          z.object({
            abi: workerAppAbiSchema,
            versionCode: z.number().int().positive(),
            file: releaseFileNameSchema,
            sizeBytes: z.number().int().positive(),
            sha256: sha256HexSchema,
          }),
        )
        .min(1),
    })
    .nullable(),
  /** The latest signed JS update per runtime version. */
  updates: z.record(
    workerAppPathSegmentSchema,
    z.object({ id: workerAppPathSegmentSchema, createdAt: z.string().datetime() }),
  ),
});

export type WorkerAppReleases = z.infer<typeof workerAppReleasesSchema>;

/** `GET /worker-app/latest`: the download page's and the update prompt's read. */
export const workerAppLatestSchema = z.object({
  /** The page workers are sent to (`WORKER_APP_PUBLIC_URL`). */
  downloadUrl: z.string(),
  release: z
    .object({
      versionName: z.string(),
      versionCode: z.number().int(),
      minVersionCode: z.number().int(),
      publishedAt: z.string(),
      notes: z.string().nullable(),
      certificateSha256: z.string(),
      apks: z.array(
        z.object({
          abi: workerAppAbiSchema,
          versionCode: z.number().int(),
          sizeBytes: z.number().int(),
          sha256: z.string(),
          /** The API path (`/worker-app/apk/<file>`); each client adds its own base. */
          path: z.string(),
        }),
      ),
    })
    .nullable(),
});

export type WorkerAppLatestDto = z.infer<typeof workerAppLatestSchema>;
