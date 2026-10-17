import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { ofacGate } from '@ota/domain';
import { ofacReminderEmail, type Mailer } from '@ota/email';
import type { OfacReminderResultDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { accountReservationUrl } from '../common/storefront-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

/**
 * The E-OFAC reminder (Phase 6): A-Customers sends it for one of a traveler's
 * trips whose US persons still have no certification. The send is audited; it
 * does not change any OFAC record.
 */
@Injectable()
export class OfacRemindersService {
  private readonly logger = new Logger(OfacRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async send(
    customerId: string,
    reservationId: string,
    actor: AuthUser,
  ): Promise<OfacReminderResultDto> {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, userId: customerId },
      include: {
        user: {
          select: { email: true, fullName: true, locale: true, anonymizedAt: true },
        },
        travelers: { orderBy: { position: 'asc' } },
        affidavits: { select: { travelerId: true } },
      },
    });
    if (!reservation) {
      throw new NotFoundException(
        `Reservation ${reservationId} not found for this customer`,
      );
    }
    if (reservation.user.anonymizedAt) {
      throw new ConflictException('The customer record has been anonymized');
    }

    const gate = ofacGate(reservation.travelers, reservation.affidavits);
    if (gate.missing.length === 0) {
      throw new ConflictException('Every US traveler on this booking is certified');
    }

    const missing = reservation.travelers
      .filter((traveler) => gate.missing.includes(traveler.id))
      .map((traveler) => traveler.fullName);

    await this.mailer.send(
      ofacReminderEmail({
        to: reservation.user.email,
        name: reservation.user.fullName ?? reservation.user.email,
        bookingCode: reservation.bookingCode,
        startDate: reservation.startDate,
        travelers: missing,
        portalUrl: accountReservationUrl(
          this.tenant,
          reservation.user.locale,
          reservation.id,
        ),
        locale: reservation.user.locale,
        branding: this.tenant.branding,
      }),
    );

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: 'ofac.reminder_sent',
        entityType: 'Reservation',
        entityId: reservation.id,
        metadata: {
          customerId,
          bookingCode: reservation.bookingCode,
          missing: missing.length,
        },
      },
    });

    this.logger.log(
      `OFAC reminder sent for ${reservation.bookingCode} (${missing.length} traveler(s))`,
    );
    return { sent: true, missing: missing.length };
  }
}
