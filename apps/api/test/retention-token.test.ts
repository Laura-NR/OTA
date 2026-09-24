import { describe, expect, it } from 'vitest';

import {
  signRetentionToken,
  verifyRetentionToken,
} from '../src/retention/retention-token';

const SECRET = 'retention-test-secret-0123456789';
const USER_ID = '33333333-3333-4333-8333-333333333333';

describe('retention keep-alive token', () => {
  it('round-trips a valid token', () => {
    const expiresAt = new Date('2026-08-09T00:00:00Z');
    const token = signRetentionToken({ userId: USER_ID, expiresAt, secret: SECRET });

    const payload = verifyRetentionToken(token, SECRET, new Date('2026-07-20T00:00:00Z'));
    expect(payload).toEqual({ userId: USER_ID, expiresAt });
  });

  it('rejects a tampered signature', () => {
    const token = signRetentionToken({
      userId: USER_ID,
      expiresAt: new Date('2026-08-09T00:00:00Z'),
      secret: SECRET,
    });
    const [encoded] = token.split('.');
    const forged = `${encoded}.${Buffer.from('forged').toString('base64url')}`;

    expect(verifyRetentionToken(forged, SECRET)).toBeNull();
  });

  it('rejects a token signed with another secret', () => {
    const token = signRetentionToken({
      userId: USER_ID,
      expiresAt: new Date('2026-08-09T00:00:00Z'),
      secret: 'a-different-secret',
    });

    expect(verifyRetentionToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token and malformed input', () => {
    const token = signRetentionToken({
      userId: USER_ID,
      expiresAt: new Date('2026-08-09T00:00:00Z'),
      secret: SECRET,
    });

    expect(
      verifyRetentionToken(token, SECRET, new Date('2026-08-10T00:00:00Z')),
    ).toBeNull();
    expect(verifyRetentionToken('not-a-token', SECRET)).toBeNull();
    expect(verifyRetentionToken('', SECRET)).toBeNull();
  });
});
