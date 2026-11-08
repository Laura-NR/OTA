import { Global, Module } from '@nestjs/common';
import { createObjectStorage } from '@ota/storage';

export const OBJECT_STORAGE = 'ota:object-storage';

/** The object storage the environment configures; the API and its commands share it. */
export function objectStorageFromEnv() {
  return createObjectStorage({
    bucket: process.env.S3_BUCKET ?? 'ota-documents',
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  });
}

/**
 * Provides object storage for credentials and assets. Uses S3/MinIO when
 * configured, otherwise an in-memory fallback so the API still boots in dev.
 * Global so feature modules can inject it without importing this module.
 */
@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      useFactory: objectStorageFromEnv,
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
