import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from '@nestjs/websockets';
import { UserRole } from '@ota/domain';
import type { IncomingHttpHeaders } from 'node:http';
import type { Server, Socket } from 'socket.io';

import { AuthService } from '../auth/auth.service';
import type { EscalationEvent, EscalationPublisher } from './escalation.publisher';

const OPS_ROOM = 'ops';
const OPS_ROLES: readonly string[] = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
];

/**
 * Real-time escalation channel for the operations desk. Clients connect to the
 * `ops` namespace; the handshake is authenticated with the Better Auth session
 * cookie and only operations roles may join. Events mirror dispatch activity so
 * the dashboard can raise amber/red cues and offer click-to-call.
 */
@WebSocketGateway({ namespace: 'ops', cors: { origin: true, credentials: true } })
export class EscalationGateway
  implements EscalationPublisher, OnGatewayConnection, OnGatewayInit
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EscalationGateway.name);

  constructor(private readonly auth: AuthService) {}

  afterInit(): void {
    this.logger.log('Escalation gateway ready on namespace /ops');
  }

  async handleConnection(client: Socket): Promise<void> {
    const session = await this.auth
      .getSession(client.handshake.headers as IncomingHttpHeaders)
      .catch(() => null);

    const role = session?.user.role ?? null;
    if (!session || !role || !OPS_ROLES.includes(role)) {
      client.disconnect(true);
      return;
    }

    await client.join(OPS_ROOM);
  }

  publish(event: EscalationEvent): void {
    this.server?.to(OPS_ROOM).emit('escalation', event);
  }
}
