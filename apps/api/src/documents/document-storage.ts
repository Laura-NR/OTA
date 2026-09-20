import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const DOCUMENT_STORAGE = 'ota:document-storage';

export interface DocumentStorage {
  save(key: string, data: Uint8Array): Promise<void>;
}

/**
 * Writes generated PDFs under a local directory. Replace with an S3/MinIO
 * adapter for multi-instance deployments; the interface is storage-agnostic.
 */
export class LocalDocumentStorage implements DocumentStorage {
  constructor(private readonly baseDir: string) {}

  async save(key: string, data: Uint8Array): Promise<void> {
    const fullPath = join(this.baseDir, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  }
}
