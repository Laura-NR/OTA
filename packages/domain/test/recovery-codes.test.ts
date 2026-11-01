import { describe, expect, it } from 'vitest';

import {
  RECOVERY_CODE_LENGTH,
  RECOVERY_CODE_MAX_FAILURES,
  RECOVERY_CODE_SIGN_IN_METHOD,
  UserRole,
  formatRecoveryCode,
  isRecoverySessionOver,
  normalizeRecoveryCode,
  passkeyChangeRefusal,
  passkeyRefusal,
  recoveryCodeExpiresAt,
  recoveryCodeFromBytes,
  recoveryCodeState,
  recoveryFailureWithdraws,
} from '../src';

const ISSUED = new Date('2026-11-01T10:00:00Z');
const minutes = (count: number) => new Date(ISSUED.getTime() + count * 60_000);

describe('a recovery code (docs/schema-m9-recovery-codes.md R4)', () => {
  it('is twelve characters with no look-alikes, from one random byte each', () => {
    const bytes = Uint8Array.from({ length: RECOVERY_CODE_LENGTH }, (_, i) => i * 21);
    const code = recoveryCodeFromBytes(bytes);
    expect(code).toHaveLength(12);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    // 256 is a multiple of 32: a byte and the same byte + 32 give the same character.
    expect(recoveryCodeFromBytes(bytes.map((byte) => (byte + 32) % 256))).toBe(code);
  });

  it('needs twelve random bytes', () => {
    expect(() => recoveryCodeFromBytes(new Uint8Array(11))).toThrow(RangeError);
  });

  it('is shown in three groups of four', () => {
    expect(formatRecoveryCode('ABCD2345WXYZ')).toBe('ABCD-2345-WXYZ');
  });

  it('is accepted in any case, with or without hyphens and spaces', () => {
    for (const typed of ['ABCD-2345-WXYZ', 'abcd2345wxyz', ' abcd 2345 - wxyz ']) {
      expect(normalizeRecoveryCode(typed)).toBe('ABCD2345WXYZ');
    }
  });

  it('reads I, L and O typed by mistake as 1, 1 and 0', () => {
    expect(normalizeRecoveryCode('ilo0-1111-2222')).toBe('110011112222');
  });

  it('is refused when it cannot be a code: wrong length or a U', () => {
    expect(normalizeRecoveryCode('ABCD-2345-WXY')).toBeNull();
    expect(normalizeRecoveryCode('ABCD-2345-WXYZ1')).toBeNull();
    expect(normalizeRecoveryCode('ABCD-2345-WXYU')).toBeNull();
    expect(normalizeRecoveryCode('')).toBeNull();
  });
});

describe('when a recovery code works (R1, R4)', () => {
  const open = {
    expiresAt: recoveryCodeExpiresAt(ISSUED),
    usedAt: null,
    withdrawnAt: null,
  };

  it('works for 15 minutes from issue', () => {
    expect(recoveryCodeExpiresAt(ISSUED)).toEqual(minutes(15));
    expect(recoveryCodeState(open, minutes(14))).toBe('open');
    expect(recoveryCodeState(open, minutes(15))).toBe('expired');
  });

  it('works once, and not after it was withdrawn', () => {
    expect(recoveryCodeState({ ...open, usedAt: minutes(2) }, minutes(3))).toBe('used');
    expect(recoveryCodeState({ ...open, withdrawnAt: minutes(2) }, minutes(3))).toBe(
      'withdrawn',
    );
  });

  it('is withdrawn by the fifth wrong try, not before', () => {
    expect(RECOVERY_CODE_MAX_FAILURES).toBe(5);
    expect(recoveryFailureWithdraws(4)).toBe(false);
    expect(recoveryFailureWithdraws(5)).toBe(true);
  });
});

describe('the session a recovery code opens (R3)', () => {
  it('ends 15 minutes after sign-in', () => {
    expect(isRecoverySessionOver(RECOVERY_CODE_SIGN_IN_METHOD, ISSUED, minutes(14))).toBe(
      false,
    );
    expect(isRecoverySessionOver(RECOVERY_CODE_SIGN_IN_METHOD, ISSUED, minutes(15))).toBe(
      true,
    );
  });

  it('leaves other sessions to their own limits', () => {
    for (const method of ['passkey', 'magic_link', null]) {
      expect(isRecoverySessionOver(method, ISSUED, minutes(600))).toBe(false);
    }
  });

  it('may only set up a passkey, even while the passkey rule is off', () => {
    for (const required of [false, true]) {
      expect(
        passkeyRefusal({
          role: UserRole.OperationsAdmin,
          required,
          signInMethod: RECOVERY_CODE_SIGN_IN_METHOD,
          passkeyCount: 0,
        }),
      ).toBe('enroll');
      expect(
        passkeyRefusal({
          role: UserRole.OperationsAdmin,
          required,
          signInMethod: RECOVERY_CODE_SIGN_IN_METHOD,
          passkeyCount: 1,
        }),
      ).toBe('use_passkey');
    }
  });

  it('adds a first passkey, but changes no other', () => {
    const base = {
      role: UserRole.SuperAdmin,
      required: false,
      signInMethod: RECOVERY_CODE_SIGN_IN_METHOD,
    };
    expect(
      passkeyChangeRefusal({ ...base, passkeyCount: 0, change: 'register' }),
    ).toBeNull();
    expect(passkeyChangeRefusal({ ...base, passkeyCount: 1, change: 'register' })).toBe(
      'PASSKEY_SESSION_REQUIRED',
    );
    expect(passkeyChangeRefusal({ ...base, passkeyCount: 1, change: 'delete' })).toBe(
      'PASSKEY_SESSION_REQUIRED',
    );
  });

  it('changes nothing for a traveler', () => {
    expect(
      passkeyRefusal({
        role: UserRole.Traveler,
        required: false,
        signInMethod: RECOVERY_CODE_SIGN_IN_METHOD,
        passkeyCount: 0,
      }),
    ).toBeNull();
  });
});
