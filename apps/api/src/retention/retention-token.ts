import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RetentionTokenPayload {
  userId: string;
  expiresAt: Date;
}

interface EncodedPayload {
  uid: string;
  /** Unix epoch milliseconds. */
  exp: number;
}

function signature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

/**
 * Create a stateless, tamper-evident keep-alive token (spec §3.5). The token
 * carries the traveler id and an expiry and is signed with `AUTH_SECRET`, so no
 * extra column or dependency is needed. It is single-purpose: only the
 * retention consent endpoint verifies it.
 */
export function signRetentionToken(input: {
  userId: string;
  expiresAt: Date;
  secret: string;
}): string {
  const encoded = Buffer.from(
    JSON.stringify({ uid: input.userId, exp: input.expiresAt.getTime() }),
  ).toString('base64url');
  return `${encoded}.${signature(encoded, input.secret).toString('base64url')}`;
}

/**
 * Verify signature and expiry. Returns null for a malformed, tampered, or
 * expired token; never throws.
 */
export function verifyRetentionToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): RetentionTokenPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) {
    return null;
  }

  const encoded = token.slice(0, dot);
  const provided = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = signature(encoded, secret);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: EncodedPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    typeof payload?.uid !== 'string' ||
    typeof payload?.exp !== 'number' ||
    payload.exp < now.getTime()
  ) {
    return null;
  }

  return { userId: payload.uid, expiresAt: new Date(payload.exp) };
}
