import { describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../src/auth/auth.service';
import { MessagingGateway } from '../src/messages/messaging.gateway';
import type { PrismaService } from '../src/prisma/prisma.service';
import { fakeSessionPolicy } from './fixtures/session-policy';

function makeSocket() {
  return {
    handshake: {
      headers: { cookie: 'better-auth.session=abc' },
      query: { reservationId: 'r-1' },
    },
    join: vi.fn(async () => undefined),
    disconnect: vi.fn(),
  };
}

const prisma = {
  reservation: { findUnique: async () => ({ userId: 'traveler-1' }) },
} as unknown as PrismaService;

function auth(user: Record<string, unknown>, signInMethod = 'magic_link'): AuthService {
  return {
    getSession: vi.fn(async () => ({
      user: { email: 'x@example.test', deactivatedAt: null, ...user },
      session: { id: 's', userId: user.id, createdAt: new Date(), signInMethod },
    })),
  } as unknown as AuthService;
}

describe('MessagingGateway', () => {
  it('lets the booking owner join its conversation', async () => {
    const socket = makeSocket();
    await new MessagingGateway(
      auth({ id: 'traveler-1', role: 'TRAVELER' }),
      prisma,
      fakeSessionPolicy({ required: true }),
    ).handleConnection(socket as never);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('refuses a deactivated user (M9 D5)', async () => {
    const socket = makeSocket();
    await new MessagingGateway(
      auth({ id: 'ops-1', role: 'OPERATIONS_ADMIN', deactivatedAt: new Date() }),
      prisma,
      fakeSessionPolicy(),
    ).handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('refuses a staff link session under the passkey rule, not a passkey one', async () => {
    const fromLink = makeSocket();
    await new MessagingGateway(
      auth({ id: 'ops-1', role: 'OPERATIONS_ADMIN' }),
      prisma,
      fakeSessionPolicy({ required: true, passkeys: 1 }),
    ).handleConnection(fromLink as never);
    expect(fromLink.disconnect).toHaveBeenCalledWith(true);

    const fromPasskey = makeSocket();
    await new MessagingGateway(
      auth({ id: 'ops-1', role: 'OPERATIONS_ADMIN' }, 'passkey'),
      prisma,
      fakeSessionPolicy({ required: true, passkeys: 1 }),
    ).handleConnection(fromPasskey as never);
    expect(fromPasskey.disconnect).not.toHaveBeenCalled();
  });
});
