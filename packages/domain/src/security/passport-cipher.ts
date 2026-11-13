/**
 * Passport numbers at rest (M2 decision D1, `docs/schema-m2-travelers.md`):
 * AES-256-GCM under a 32-byte key from `PASSPORT_ENCRYPTION_KEY`, so the
 * database only ever holds ciphertext and the key stays out of it.
 *
 * The payload is `v1.<iv>.<tag>.<ciphertext>` (base64url), versioned so a key
 * rotation can re-encrypt in place. A context string (the traveler id) is
 * bound as additional authenticated data, so a ciphertext copied onto another
 * row fails to decrypt.
 *
 * This module imports `node:crypto`, so it is a separate entry point
 * (`@ota/domain/passport-cipher`) that browser bundles never load.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class PassportCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PassportCipherError';
  }
}

/** Decode a base64 key (as `openssl rand -base64 32` prints it); it must be 32 bytes. */
export function parsePassportKey(raw: string): Buffer {
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== KEY_BYTES) {
    throw new PassportCipherError(
      `The passport key must be ${KEY_BYTES} bytes of base64; got ${key.length} bytes`,
    );
  }
  return key;
}

export function encryptPassportNumber(
  plaintext: string,
  key: Buffer,
  context: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

/** Throws `PassportCipherError` on a malformed payload, a wrong key or a wrong context. */
export function decryptPassportNumber(
  payload: string,
  key: Buffer,
  context: string,
): string {
  const [version, iv, tag, ciphertext, ...rest] = payload.split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new PassportCipherError('Unrecognised passport ciphertext');
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new PassportCipherError('The passport ciphertext could not be decrypted');
  }
}
