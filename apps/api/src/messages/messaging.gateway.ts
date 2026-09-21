import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UserRole } from '@ota/domain';
import type { IncomingHttpHeaders } from 'node:http';
import type { Server, Socket } from 'socket.io';

import { AuthService } from '../auth/auth.service';
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
 * `conversations` namespace with `?reservationId=...`; only the reservation's
 * owner or an operations role may join. If nobody is connected, the message is
 * still delivered by email (see MessagesService).
 */
@WebSocketGateway({
  namespace: 'conversations',
  cors: { origin: true, credentials: true },
})
export class MessagingGateway implements MessagePublisher, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const session = await this.auth
      .getSession(client.handshake.headers as IncomingHttpHeaders)
      .catch(() => null);
    if (!session) {
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
