import { describe, expect, it } from 'vitest';

import { createObjectStorage, InMemoryObjectStorage, S3ObjectStorage } from '../src';

describe('InMemoryObjectStorage', () => {
  it('round-trips an object and deletes it', async () => {
    const storage = new InMemoryObjectStorage();

    await storage.put('credentials/1.png', new Uint8Array([1, 2, 3]), 'image/png');

    const object = await storage.get('credentials/1.png');
    expect(object?.contentType).toBe('image/png');
    expect(Array.from(object?.body ?? [])).toEqual([1, 2, 3]);

    await storage.delete('credentials/1.png');
    expect(await storage.get('credentials/1.png')).toBeNull();
  });
});

describe('createObjectStorage', () => {
  it('falls back to in-memory when S3 is not configured', () => {
    expect(
      createObjectStorage({ bucket: 'ota-documents', region: 'us-east-1' }),
    ).toBeInstanceOf(InMemoryObjectStorage);
  });

  it('uses S3 when an endpoint and credentials are configured', () => {
    expect(
      createObjectStorage({
        bucket: 'ota-documents',
        region: 'us-east-1',
        endpoint: 'http://localhost:9000',
        accessKeyId: 'minio',
        secretAccessKey: 'minio123',
      }),
    ).toBeInstanceOf(S3ObjectStorage);
  });
});
