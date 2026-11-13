import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  PassportCipherError,
  decryptPassportNumber,
  encryptPassportNumber,
  parsePassportKey,
} from '../src/security/passport-cipher';

const key = randomBytes(32);
const traveler = '7d0c5f0e-8f43-4c3a-9a43-1f8f2b6c0a11';

describe('passport cipher', () => {
  it('round-trips a passport number and never stores the plaintext', () => {
    const payload = encryptPassportNumber('X1234567', key, traveler);

    expect(payload.startsWith('v1.')).toBe(true);
    expect(payload).not.toContain('X1234567');
    expect(decryptPassportNumber(payload, key, traveler)).toBe('X1234567');
  });

  it('uses a fresh IV, so the same number encrypts differently each time', () => {
    expect(encryptPassportNumber('X1234567', key, traveler)).not.toBe(
      encryptPassportNumber('X1234567', key, traveler),
    );
  });

  it('refuses a ciphertext moved to another traveler', () => {
    const payload = encryptPassportNumber('X1234567', key, traveler);

    expect(() => decryptPassportNumber(payload, key, 'another-traveler')).toThrow(
      PassportCipherError,
    );
  });

  it('refuses a wrong key and a tampered payload', () => {
    const payload = encryptPassportNumber('X1234567', key, traveler);
    const parts = payload.split('.');
    const tampered = [
      ...parts.slice(0, 3),
      Buffer.from('Y7654321').toString('base64url'),
    ];

    expect(() => decryptPassportNumber(payload, randomBytes(32), traveler)).toThrow(
      PassportCipherError,
    );
    expect(() => decryptPassportNumber(tampered.join('.'), key, traveler)).toThrow(
      PassportCipherError,
    );
    expect(() => decryptPassportNumber('plain-text', key, traveler)).toThrow(
      PassportCipherError,
    );
  });

  it('accepts only a 32-byte base64 key', () => {
    expect(parsePassportKey(key.toString('base64')).equals(key)).toBe(true);
    expect(() => parsePassportKey(randomBytes(16).toString('base64'))).toThrow(
      PassportCipherError,
    );
  });
});
