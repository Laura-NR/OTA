export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

/**
 * Storage-agnostic object storage. Implementations must keep objects private;
 * callers hand out short-lived, authorised API routes rather than public URLs.
 */
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

interface Entry {
  body: Uint8Array;
  contentType: string;
}

/**
 * In-memory implementation for tests and local runs without S3 configured.
 * Objects do not survive a process restart.
 */
export class InMemoryObjectStorage implements ObjectStorage {
  private readonly entries = new Map<string, Entry>();

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.entries.set(key, { body: Uint8Array.from(body), contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    const entry = this.entries.get(key);
    return entry
      ? { body: Uint8Array.from(entry.body), contentType: entry.contentType }
      : null;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}
