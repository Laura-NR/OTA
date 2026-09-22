import { describe, expect, it } from 'vitest';

import { S3ObjectStorage } from '../src';

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const bucket = process.env.S3_BUCKET ?? 'ota-documents';

/**
 * Live S3/MinIO round-trip. Skipped unless the S3_* variables are set, so the
 * default suite needs no object storage.
 */
describe.skipIf(!endpoint || !accessKeyId || !secretAccessKey)(
  'S3ObjectStorage (live MinIO)',
  () => {
    it('round-trips an object through the bucket', async () => {
      const storage = new S3ObjectStorage({
        bucket,
        region: process.env.S3_REGION ?? 'us-east-1',
        endpoint,
        accessKeyId,
        secretAccessKey,
      });
      const key = `test/storage-${Date.now()}.txt`;

      await storage.put(key, new TextEncoder().encode('hello'), 'text/plain');

      const object = await storage.get(key);
      expect(object?.contentType).toContain('text/plain');
      expect(new TextDecoder().decode(object?.body)).toBe('hello');

      await storage.delete(key);
      expect(await storage.get(key)).toBeNull();
    }, 15_000);
  },
);
