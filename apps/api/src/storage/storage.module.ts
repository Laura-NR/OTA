import { Global, Module } from '@nestjs/common';
import { createObjectStorage } from '@ota/storage';

export const OBJECT_STORAGE = 'ota:object-storage';

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
      useFactory: () =>
        createObjectStorage({
          bucket: process.env.S3_BUCKET ?? 'ota-documents',
          region: process.env.S3_REGION ?? 'us-east-1',
          endpoint: process.env.S3_ENDPOINT,
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
