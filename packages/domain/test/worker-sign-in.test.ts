import { describe, expect, it } from 'vitest';

import {
  WORKER_CODE_MAX_FAILURES,
  fitsOneSmsSegment,
  maskWorkerPhone,
  normalizeWorkerCode,
  normalizeWorkerPhone,
  workerCodeExpiresAt,
  workerCodeFailureVoids,
  workerCodeFromBytes,
  workerCodeMayResend,
  workerCodeSms,
  workerSessionExpiresAt,
} from '../src';

const ISSUED = new Date('2026-11-09T10:00:00Z');
const seconds = (count: number) => new Date(ISSUED.getTime() + count * 1000);

describe('worker sign-in codes (W-Login)', () => {
  it('reads six digits from four random bytes', () => {
    expect(workerCodeFromBytes(new Uint8Array([0, 0, 0, 7]))).toBe('000007');
    expect(workerCodeFromBytes(new Uint8Array([0, 0x0f, 0x42, 0x3f]))).toBe('999999');
  });

  it('skips a value that would make some codes likelier than others', () => {
    const biased = [0xff, 0xff, 0xff, 0xff];
    expect(workerCodeFromBytes(new Uint8Array([...biased, 0, 0, 0, 42]))).toBe('000042');
    expect(() => workerCodeFromBytes(new Uint8Array(biased))).toThrow(RangeError);
  });

  it('accepts a typed code with spaces or a hyphen and nothing else', () => {
    expect(normalizeWorkerCode(' 123 456 ')).toBe('123456');
    expect(normalizeWorkerCode('123-456')).toBe('123456');
    expect(normalizeWorkerCode('12345')).toBeNull();
    expect(normalizeWorkerCode('12345a')).toBeNull();
    expect(normalizeWorkerCode('1234567')).toBeNull();
  });

  it('works for ten minutes and lets an SMS resend after 45 seconds', () => {
    expect(workerCodeExpiresAt(ISSUED)).toEqual(seconds(600));
    expect(workerCodeMayResend(ISSUED, seconds(44))).toBe(false);
    expect(workerCodeMayResend(ISSUED, seconds(45))).toBe(true);
  });

  it('voids the code on the fifth wrong try', () => {
    expect(workerCodeFailureVoids(WORKER_CODE_MAX_FAILURES - 1)).toBe(false);
    expect(workerCodeFailureVoids(WORKER_CODE_MAX_FAILURES)).toBe(true);
  });

  it('keeps the phone signed in for 30 days', () => {
    expect(workerSessionExpiresAt(ISSUED)).toEqual(new Date('2026-12-09T10:00:00Z'));
  });

  it('sends the code as one GSM-7 segment with no accents', () => {
    const sms = workerCodeSms('123456');
    expect(sms).toContain('123456');
    expect(fitsOneSmsSegment(sms)).toBe(true);
    expect(sms.toLowerCase()).not.toMatch(/reply|responde/);
  });
});

describe('worker phone numbers (W-Login "+53")', () => {
  it('reads a Cuban number typed with or without the country code', () => {
    expect(normalizeWorkerPhone('5 241 0088')).toBe('+5352410088');
    expect(normalizeWorkerPhone('52410088')).toBe('+5352410088');
    expect(normalizeWorkerPhone('53 5241 0088')).toBe('+5352410088');
    expect(normalizeWorkerPhone('+53 5241-0088')).toBe('+5352410088');
    expect(normalizeWorkerPhone('0053 (5) 241.00.88')).toBe('+5352410088');
  });

  it('matches the way supplier profiles store numbers', () => {
    expect(normalizeWorkerPhone('+53 5555 0002')).toBe(normalizeWorkerPhone('55550002'));
  });

  it('keeps another country code and refuses what cannot be a number', () => {
    expect(normalizeWorkerPhone('+34 600 123 456')).toBe('+34600123456');
    expect(normalizeWorkerPhone('5241008')).toBeNull();
    expect(normalizeWorkerPhone('+53 5241 008x')).toBeNull();
    expect(normalizeWorkerPhone('')).toBeNull();
  });

  it('hides two digits when confirming where the code went', () => {
    expect(maskWorkerPhone('+5352410088')).toBe('+53 5 241 •• 88');
    expect(maskWorkerPhone('+34600123456')).toBe('+3460012 •• 56');
  });
});

describe('one SMS segment', () => {
  it('refuses the accents Cuban SMS must avoid and anything over 160 characters', () => {
    expect(fitsOneSmsSegment('Tu codigo es 123456')).toBe(true);
    expect(fitsOneSmsSegment('Tu código es 123456')).toBe(false);
    expect(fitsOneSmsSegment('a'.repeat(160))).toBe(true);
    expect(fitsOneSmsSegment('a'.repeat(161))).toBe(false);
    expect(fitsOneSmsSegment('Pago 180 €')).toBe(false);
  });
});
