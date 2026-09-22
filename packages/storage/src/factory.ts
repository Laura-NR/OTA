import { S3ObjectStorage, type S3ObjectStorageOptions } from './s3';
import { InMemoryObjectStorage, type ObjectStorage } from './storage';

/**
 * Build the object storage for a deployment. Uses S3/MinIO when an endpoint and
 * credentials are configured; otherwise falls back to in-memory (dev/tests,
 * objects not persisted across restarts).
 */
export function createObjectStorage(options: S3ObjectStorageOptions): ObjectStorage {
  const configured =
    Boolean(options.endpoint) &&
    Boolean(options.accessKeyId) &&
    Boolean(options.secretAccessKey);
  return configured ? new S3ObjectStorage(options) : new InMemoryObjectStorage();
}
