import { Logger, type OnModuleDestroy } from '@nestjs/common';
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
import { SessionPolicy, sessionMayConnect } from '../auth/session-policy';
import { startSocketRecheck } from '../auth/socket-recheck';
import { SOCKET_ORIGIN_OPTIONS } from '../common/trusted-origins';
import type {
  DeskAlertEvent,
  EscalationEvent,
  EscalationPublisher,
} from './escalation.publisher';

const OPS_ROOM = 'ops';
const OPS_ROLES: readonly string[] = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
];

/**
 * Real-time escalation channel for the operations desk. Clients connect to the
 * `ops` namespace from a trusted origin; the handshake is authenticated with
 * the Better Auth session cookie, and only operations roles whose session the guard would accept
 * (`SessionPolicy`, passkey rule included) may join, and a socket whose
 * session is refused later (idle lock, deactivation) is dropped within a
 * minute. Events mirror dispatch activity so
 * the dashboard can raise amber/red cues and offer click-to-call, and the desk's
 * acknowledgements and mutes so every open desk stops or resumes its cue.
 */
@WebSocketGateway({ namespace: 'ops', ...SOCKET_ORIGIN_OPTIONS })
export class EscalationGateway
  implements EscalationPublisher, OnGatewayConnection, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(EscalationGateway.name);
  private stopRecheck?: () => void;

  constructor(
    private readonly auth: AuthService,
    private readonly policy: SessionPolicy,
  ) {}

  afterInit(): void {
    this.stopRecheck = startSocketRecheck(
      this.server,
      this.auth,
      this.policy,
      this.logger,
    );
    this.logger.log('Escalation gateway ready on namespace /ops');
  }

  onModuleDestroy(): void {
    this.stopRecheck?.();
  }

  async handleConnection(client: Socket): Promise<void> {
    const session = await this.auth
      .getSession(client.handshake.headers as IncomingHttpHeaders)
      .catch(() => null);

    const role = session?.user.role ?? null;
    if (
      !session ||
      !role ||
      !OPS_ROLES.includes(role) ||
      !(await sessionMayConnect(this.policy, session, this.logger))
    ) {
      client.disconnect(true);
      return;
    }

    await client.join(OPS_ROOM);
  }

  publish(event: EscalationEvent | DeskAlertEvent): void {
    this.server?.to(OPS_ROOM).emit('escalation', event);
  }
}
