import { Logger, type OnModuleDestroy } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  type OnGatewayInit,
  WebSocketServer,
} from '@nestjs/websockets';
import { UserRole } from '@ota/domain';
import type { IncomingHttpHeaders } from 'node:http';
import type { Server, Socket } from 'socket.io';

import { AuthService } from '../auth/auth.service';
import { SessionPolicy, sessionMayConnect } from '../auth/session-policy';
import { startSocketRecheck } from '../auth/socket-recheck';
import { SOCKET_ORIGIN_OPTIONS } from '../common/trusted-origins';
import { PrismaService } from '../prisma/prisma.service';
import type { MessageEvent, MessagePublisher } from './message.publisher';

const OPS_ROLES: readonly string[] = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
];

function reservationRoom(reservationId: string): string {
  return `reservation:${reservationId}`;
}

/**
 * Real-time channel for traveler↔operations messaging. Clients connect to the
 * `conversations` namespace with `?reservationId=...` from a trusted origin;
 * only the reservation's owner or an operations role may join, with a session
 * the guard would accept (`SessionPolicy`, passkey rule included); a socket whose session is
 * refused later (idle lock, deactivation) is dropped within a minute. If nobody is connected, the message is
 * still delivered by email (see MessagesService).
 */
@WebSocketGateway({
  namespace: 'conversations',
  ...SOCKET_ORIGIN_OPTIONS,
})
export class MessagingGateway
  implements MessagePublisher, OnGatewayConnection, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private stopRecheck?: () => void;

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly policy: SessionPolicy,
  ) {}

  afterInit(): void {
    this.stopRecheck = startSocketRecheck(
      this.server,
      this.auth,
      this.policy,
      this.logger,
    );
  }

  onModuleDestroy(): void {
    this.stopRecheck?.();
  }

  async handleConnection(client: Socket): Promise<void> {
    const session = await this.auth
      .getSession(client.handshake.headers as IncomingHttpHeaders)
      .catch(() => null);
    if (!session || !(await sessionMayConnect(this.policy, session, this.logger))) {
      client.disconnect(true);
      return;
    }

    const reservationId = client.handshake.query?.reservationId;
    if (typeof reservationId !== 'string' || reservationId.length === 0) {
      client.disconnect(true);
      return;
    }

    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { userId: true },
    });
    const isOps = OPS_ROLES.includes(session.user.role ?? '');
    const isOwner = reservation?.userId === session.user.id;
    if (!reservation || (!isOps && !isOwner)) {
      this.logger.debug(`Rejected conversation socket for reservation ${reservationId}`);
      client.disconnect(true);
      return;
    }

    await client.join(reservationRoom(reservationId));
  }

  publish(event: MessageEvent): void {
    this.server?.to(reservationRoom(event.reservationId)).emit('message', event);
  }
}
