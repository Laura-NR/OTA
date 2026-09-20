import { describe, expect, it, vi } from 'vitest';

import type { AuthService } from '../src/auth/auth.service';
import { EscalationGateway } from '../src/escalation/escalation.gateway';
import type { EscalationEvent } from '../src/escalation/escalation.publisher';

function makeSocket() {
  return {
    handshake: { headers: { cookie: 'better-auth.session=abc' } },
    join: vi.fn(async () => undefined),
    disconnect: vi.fn(),
  };
}

function sessionWithRole(role: string) {
  return {
    user: { id: 'user-1', email: 'user@example.test', role },
    session: { id: 'session-1', userId: 'user-1', expiresAt: new Date() },
  };
}

describe('EscalationGateway', () => {
  it('admits an operations admin to the ops room', async () => {
    const auth = {
      getSession: vi.fn(async () => sessionWithRole('OPERATIONS_ADMIN')),
    } as unknown as AuthService;
    const socket = makeSocket();

    await new EscalationGateway(auth).handleConnection(socket as never);

    expect(socket.join).toHaveBeenCalledWith('ops');
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated connection', async () => {
    const auth = { getSession: vi.fn(async () => null) } as unknown as AuthService;
    const socket = makeSocket();

    await new EscalationGateway(auth).handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('rejects a role without operations access', async () => {
    const auth = {
      getSession: vi.fn(async () => sessionWithRole('TRAVELER')),
    } as unknown as AuthService;
    const socket = makeSocket();

    await new EscalationGateway(auth).handleConnection(socket as never);

    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(socket.join).not.toHaveBeenCalled();
  });

  it('broadcasts events to the ops room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = new EscalationGateway({} as AuthService);
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
