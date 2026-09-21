import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Message } from '@ota/db';
import { UserRole } from '@ota/domain';
import { newMessageEmail, type Mailer } from '@ota/email';
import type { MessageDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { MESSAGE_PUBLISHER, type MessagePublisher } from './message.publisher';

const OPS_ROLES: readonly string[] = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
];

type Sender = 'TRAVELER' | 'OPERATIONS';

interface ReservationAccess {
  id: string;
  bookingCode: string;
  userId: string;
  user: { email: string };
}

function toDto(message: Message): MessageDto {
  return {
    id: message.id,
    reservationId: message.reservationId,
    sender: message.sender,
    body: message.body,
    readAt: message.readAt ? message.readAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
  };
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MESSAGE_PUBLISHER) private readonly publisher: MessagePublisher,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async list(reservationId: string, actor: AuthUser): Promise<MessageDto[]> {
    await this.assertAccess(reservationId, actor);
    const messages = await this.prisma.message.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'asc' },
    });
    return messages.map(toDto);
  }

  /**
   * Persist a message, broadcast it to connected participants, and email the
   * counterparty as the asynchronous fallback (spec §3.5).
   */
  async send(reservationId: string, body: string, actor: AuthUser): Promise<MessageDto> {
    const reservation = await this.assertAccess(reservationId, actor);
    const sender: Sender =
      actor.role === UserRole.Traveler && reservation.userId === actor.id
        ? 'TRAVELER'
        : 'OPERATIONS';

    const message = await this.prisma.message.create({
      data: { reservationId, sender, body },
    });
    const dto = toDto(message);

    this.publisher.publish({ reservationId, message: dto });
    await this.notify(reservation, sender, body);

    return dto;
  }

  private async assertAccess(
    reservationId: string,
    actor: AuthUser,
  ): Promise<ReservationAccess> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        bookingCode: true,
        userId: true,
        user: { select: { email: true } },
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    const isOps = OPS_ROLES.includes(actor.role);
    const isOwner = reservation.userId === actor.id;
    if (!isOps && !isOwner) {
      throw new ForbiddenException('Reservation belongs to another traveler');
    }

    return reservation;
  }

  private async notify(
    reservation: ReservationAccess,
    sender: Sender,
    body: string,
  ): Promise<void> {
    const portalUrl = process.env.PORTAL_URL ?? 'http://localhost:3000';
    const to =
      sender === 'OPERATIONS' ? reservation.user.email : process.env.OPS_NOTIFY_EMAIL;

    if (!to) {
      return;
    }

    try {
      await this.mailer.send(
        newMessageEmail({
          to,
          reservationCode: reservation.bookingCode,
          body,
          portalUrl,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.logger.warn(
        `Message notification failed for reservation ${reservation.id}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }
}
