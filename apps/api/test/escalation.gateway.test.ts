import { describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../src/auth/auth.service';
import { EscalationGateway } from '../src/escalation/escalation.gateway';
import type { EscalationEvent } from '../src/escalation/escalation.publisher';
import { fakeSessionPolicy } from './fixtures/session-policy';

function makeSocket() {
  return {
    handshake: { headers: { cookie: 'better-auth.session=abc' } },
    join: vi.fn(async () => undefined),
    disconnect: vi.fn(),
  };
}

function sessionWithRole(
  role: string,
  extra: { deactivatedAt?: Date; signInMethod?: string } = {},
) {
  return {
    user: {
      id: 'user-1',
      email: 'user@example.test',
      role,
      deactivatedAt: extra.deactivatedAt ?? null,
    },
    session: {
      id: 'session-1',
      userId: 'user-1',
      expiresAt: new Date(),
      createdAt: new Date(),
      signInMethod: extra.signInMethod ?? 'magic_link',
    },
  };
}

describe('EscalationGateway', () => {
  it('admits an operations admin to the ops room', async () => {
    const auth = {
      getSession: vi.fn(async () => sessionWithRole('OPERATIONS_ADMIN')),
    } as unknown as AuthService;
    const socket = makeSocket();

    await new EscalationGateway(auth, fakeSessionPolicy()).handleConnection(
      socket as never,
    );

    expect(socket.join).toHaveBeenCalledWith('ops');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated connection', async () => {
    const auth = { getSession: vi.fn(async () => null) } as unknown as AuthService;
    const socket = makeSocket();

    await new EscalationGateway(auth, fakeSessionPolicy()).handleConnection(
      socket as never,
    );

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects a role without operations access', async () => {
    const auth = {
      getSession: vi.fn(async () => sessionWithRole('TRAVELER')),
    } as unknown as AuthService;
    const socket = makeSocket();

    await new EscalationGateway(auth, fakeSessionPolicy()).handleConnection(
      socket as never,
    );

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects a deactivated operator and a staff session past its limit (M9 D5, D9)', async () => {
    for (const session of [
      sessionWithRole('OPERATIONS_ADMIN', { deactivatedAt: new Date() }),
      {
        ...sessionWithRole('OPERATIONS_ADMIN'),
        session: {
          ...sessionWithRole('OPERATIONS_ADMIN').session,
          createdAt: new Date(Date.now() - 13 * 3_600_000),
        },
      },
    ]) {
      const auth = { getSession: vi.fn(async () => session) } as unknown as AuthService;
      const socket = makeSocket();
      await new EscalationGateway(auth, fakeSessionPolicy()).handleConnection(
        socket as never,
      );
      expect(socket.disconnect).toHaveBeenCalledWith(true);
      expect(socket.join).not.toHaveBeenCalled();
    }
  });

  it('applies the staff passkey rule: a link session is refused, a passkey one joins', async () => {
    const policy = fakeSessionPolicy({ required: true, passkeys: 1 });
    const fromLink = makeSocket();
    await new EscalationGateway(
      { getSession: vi.fn(async () => sessionWithRole('OPERATIONS_ADMIN')) } as never,
      policy,
    ).handleConnection(fromLink as never);
    expect(fromLink.disconnect).toHaveBeenCalledWith(true);

    const fromPasskey = makeSocket();
    await new EscalationGateway(
      {
        getSession: vi.fn(async () =>
          sessionWithRole('OPERATIONS_ADMIN', { signInMethod: 'passkey' }),
        ),
      } as never,
      policy,
    ).handleConnection(fromPasskey as never);
    expect(fromPasskey.join).toHaveBeenCalledWith('ops');
  });

  it('broadcasts events to the ops room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = new EscalationGateway({} as AuthService, fakeSessionPolicy());
    gateway.server = { to } as never;

    const event: EscalationEvent = {
      type: 'dispatch.decline',
      alert: 'RED',
      reservationId: 'res-1',
      serviceItemId: 'item-1',
      supplierId: 'sup-1',
      province: 'La Habana',
      workerPhone: '+53 5555 0000',
      occurredAt: new Date().toISOString(),
    };
    gateway.publish(event);

    expect(to).toHaveBeenCalledWith('ops');
    expect(emit).toHaveBeenCalledWith('escalation', event);
  });
});
