import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { DocumentType, buildSchedule } from '@ota/domain';
import {
  bookingConfirmedEmail,
  bookingSecuredEmail,
  reviewRequestEmail,
  tripReconfirmEmail,
  type Mailer,
} from '@ota/email';
import type { NotificationScanResultDto } from '@ota/schemas';

import {
  accountConfirmationUrl,
  accountReservationUrl,
  storefrontPageUrl,
} from '../common/storefront-url';
import { loadOfacGate } from '../compliance/ofac-gate';
import { DocumentsService } from '../documents/documents.service';
import { MAILER } from '../email/email.module';
import { depositPolicyFor } from '../payments/payment-terms';
import type { ReminderScheduler } from '../payments/reminders.scheduler';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { NOTIFICATION_SCHEDULER } from './notifications.tokens';

const DAY_MS = 86_400_000;
/** E-NPS: the request goes a day after the trip, the one reminder five days later. */
const REVIEW_AFTER_MS = DAY_MS;
const REVIEW_REMINDER_AFTER_MS = 5 * DAY_MS;
/** Trips completed longer ago than this are not asked any more. */
const REVIEW_HORIZON_MS = 30 * DAY_MS;
/** E-Reconfirm: a week before the first day. */
const RECONFIRM_DAYS = 7;

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

type Recipient = {
  email: string;
  fullName: string | null;
  locale: string;
  anonymizedAt: Date | null;
};

/**
 * The traveler notifications that follow a booking's life (Phase 6): E-Invoice
 * when it is secured, E-Confirmed when the first payment confirms it, and a
 * daily scan for the trip review request (E-NPS, adapted) and the one-week
 * reconfirmation (E-Reconfirm). Every send is best-effort: a mail failure is
 * logged and never undoes the booking change that triggered it. The scans use
 * the audit log as their sent ledger, so no migration is needed.
 */
@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(NOTIFICATION_SCHEDULER) private readonly scheduler: ReminderScheduler,
    private readonly settings: OperatingSettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.schedule(async () => {
      await this.scan();
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.close();
  }

  /**
   * E-Invoice: every host has confirmed. Offers the deposit or the full
   * amount as the first payment link would build them now (M4).
   */
  async bookingSecured(reservationId: string): Promise<void> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include: {
          user: { select: RECIPIENT },
          package: { select: { name: true, depositPolicy: true } },
        },
      });
      if (!reservation || reservation.user.anonymizedAt) {
        return;
      }
      const total = Number(reservation.totalAmount);
      const policy = depositPolicyFor(this.tenant, reservation.package?.depositPolicy);
      const plan = policy
        ? buildSchedule({
            total,
            plan: 'DEPOSIT',
            policy,
            departure: reservation.startDate,
            now: new Date(),
            windowHours: (await this.settings.thresholds()).paymentWindowHours,
          })
        : null;
      await this.mailer.send(
        bookingSecuredEmail({
          to: reservation.user.email,
          name: displayName(reservation.user),
          bookingCode: reservation.bookingCode,
          tripName: reservation.package?.name ?? null,
          startDate: reservation.startDate,
          endDate: reservation.endDate,
          total,
          currency: reservation.totalCurrency,
          deposit:
            plan && policy
              ? {
                  amount: plan[0]!.amount,
                  percent: policy.percent,
                  balance: plan[1]!.amount,
                  balanceDueAt: plan[1]!.dueAt,
                }
              : null,
          windowHours: (await this.settings.thresholds()).paymentWindowHours,
          portalUrl: accountReservationUrl(
            this.tenant,
            reservation.user.locale,
            reservation.id,
          ),
          locale: reservation.user.locale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.warn('E-Invoice', reservationId, error);
    }
  }

  /**
   * E-Confirmed: the first payment confirmed the booking and its documents
   * were issued. Attaches the voucher and the invoice; the voucher is held
   * while a US traveler has not certified (M3).
   */
  async bookingConfirmed(reservationId: string): Promise<void> {
    try {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: reservationId },
        include: {
          user: { select: RECIPIENT },
          package: { select: { name: true } },
          instalments: { orderBy: { position: 'asc' } },
        },
      });
      if (!reservation || reservation.user.anonymizedAt) {
        return;
      }
      const paid = reservation.instalments
        .filter((instalment) => instalment.status === 'PAID')
        .at(-1);
      const next = reservation.instalments.find(
        (instalment) => instalment.status === 'DUE',
      );
      const [gate, files] = await Promise.all([
        loadOfacGate(this.prisma, reservationId),
        this.documents.attachments(reservationId, [
          DocumentType.Voucher,
          DocumentType.Invoice,
        ]),
      ]);
      await this.mailer.send(
        bookingConfirmedEmail({
          to: reservation.user.email,
          name: displayName(reservation.user),
          bookingCode: reservation.bookingCode,
          tripName: reservation.package?.name ?? null,
          startDate: reservation.startDate,
          endDate: reservation.endDate,
          currency: reservation.totalCurrency,
          paid: paid ? { kind: paid.kind, amount: Number(paid.amount) } : null,
          next: next
            ? { kind: next.kind, amount: Number(next.amount), dueAt: next.dueAt }
            : null,
          voucherHeld: gate.missing.length > 0,
          attachments: files.map((file) => ({
            filename: file.filename,
            content: Buffer.from(file.content),
            contentType: 'application/pdf',
          })),
          confirmationUrl: accountConfirmationUrl(
            this.tenant,
            reservation.user.locale,
            reservation.id,
          ),
          locale: reservation.user.locale,
          branding: this.tenant.branding,
        }),
      );
    } catch (error) {
      this.warn('E-Confirmed', reservationId, error);
    }
  }

  /** One pass of the daily scan: review requests, then reconfirmations. */
  async scan(now = new Date()): Promise<NotificationScanResultDto> {
    const reviewRequests = await this.sendReviewRequests(now);
    const reconfirmations = await this.sendReconfirmations(now);
    if (reviewRequests > 0 || reconfirmations > 0) {
      this.logger.log(
        `Traveler notifications: ${reviewRequests} review request(s), ${reconfirmations} reconfirmation(s)`,
      );
    }
    return { reviewRequests, reconfirmations };
  }

  /**
   * E-NPS, adapted: a day after the trip is completed, ask for the trip
   * review; five days after that, remind once. A reviewed trip is never asked.
   */
  private async sendReviewRequests(now: Date): Promise<number> {
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          gte: new Date(now.getTime() - REVIEW_HORIZON_MS),
          lte: new Date(now.getTime() - REVIEW_AFTER_MS),
        },
        reviews: { none: {} },
      },
      include: { user: { select: RECIPIENT }, package: { select: { name: true } } },
    });

    let sent = 0;
    for (const reservation of reservations) {
      if (reservation.user.anonymizedAt) {
        continue;
      }
      const earlier = await this.prisma.auditLog.findMany({
        where: {
          action: 'email.review_request_sent',
          entityType: 'Reservation',
          entityId: reservation.id,
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      const reminder = earlier.length === 1;
      if (
        earlier.length >= 2 ||
        (reminder &&
          now.getTime() - earlier[0]!.createdAt.getTime() < REVIEW_REMINDER_AFTER_MS)
      ) {
        continue;
      }
      try {
        await this.mailer.send(
          reviewRequestEmail({
            to: reservation.user.email,
            name: displayName(reservation.user),
            bookingCode: reservation.bookingCode,
            tripName: reservation.package?.name ?? null,
            reminder,
            portalUrl: accountReservationUrl(
              this.tenant,
              reservation.user.locale,
              reservation.id,
            ),
            locale: reservation.user.locale,
            branding: this.tenant.branding,
          }),
        );
      } catch (error) {
        this.warn('E-NPS', reservation.id, error);
        continue;
      }
      await this.prisma.auditLog.create({
        data: {
          action: 'email.review_request_sent',
          entityType: 'Reservation',
          entityId: reservation.id,
          metadata: { reminder, bookingCode: reservation.bookingCode },
        },
      });
      sent += 1;
    }
    return sent;
  }

  /**
   * E-Reconfirm: seven UTC calendar days before a confirmed trip starts. A
   * missed day is skipped, as with the balance reminders.
   */
  private async sendReconfirmations(now: Date): Promise<number> {
    const day = new Date(startOfUtcDay(now).getTime() + RECONFIRM_DAYS * DAY_MS);
    const reservations = await this.prisma.reservation.findMany({
      where: {
        status: 'CONFIRMED',
        startDate: { gte: day, lt: new Date(day.getTime() + DAY_MS) },
      },
      include: {
        user: { select: RECIPIENT },
        package: { select: { name: true } },
        serviceItems: { orderBy: { serviceDateStart: 'asc' }, take: 1 },
        instalments: { where: { status: 'DUE', kind: 'BALANCE' }, take: 1 },
      },
    });

    let sent = 0;
    for (const reservation of reservations) {
      if (reservation.user.anonymizedAt) {
        continue;
      }
      const already = await this.prisma.auditLog.findFirst({
        where: {
          action: 'email.trip_reconfirm_sent',
          entityType: 'Reservation',
          entityId: reservation.id,
        },
        select: { id: true },
      });
      if (already) {
        continue;
      }
      const first = reservation.serviceItems[0];
      const balance = reservation.instalments[0];
      try {
        const [voucher] = await this.documents.attachments(reservation.id, [
          DocumentType.Voucher,
        ]);
        await this.mailer.send(
          tripReconfirmEmail({
            to: reservation.user.email,
            name: displayName(reservation.user),
            bookingCode: reservation.bookingCode,
            tripName: reservation.package?.name ?? null,
            startDate: reservation.startDate,
            endDate: reservation.endDate,
            firstMeeting: first
              ? { province: first.province, startsAt: first.serviceDateStart }
              : null,
            balance: balance
              ? {
                  amount: Number(balance.amount),
                  currency: balance.currency,
                  dueAt: balance.dueAt,
                }
              : null,
            voucher: voucher
              ? {
                  filename: voucher.filename,
                  content: Buffer.from(voucher.content),
                  contentType: 'application/pdf',
                }
              : null,
            portalUrl: accountReservationUrl(
              this.tenant,
              reservation.user.locale,
              reservation.id,
            ),
            travelInfoUrl: storefrontPageUrl(
              this.tenant,
              reservation.user.locale,
              '/travel-info',
            ),
            locale: reservation.user.locale,
            branding: this.tenant.branding,
          }),
        );
      } catch (error) {
        this.warn('E-Reconfirm', reservation.id, error);
        continue;
      }
      await this.prisma.auditLog.create({
        data: {
          action: 'email.trip_reconfirm_sent',
          entityType: 'Reservation',
          entityId: reservation.id,
          metadata: { bookingCode: reservation.bookingCode },
        },
      });
      sent += 1;
    }
    return sent;
  }

  private warn(kind: string, reservationId: string, error: unknown): void {
    this.logger.warn(
      `${kind} email failed for reservation ${reservationId}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}

const RECIPIENT = {
  email: true,
  fullName: true,
  locale: true,
  anonymizedAt: true,
} as const;

function displayName(user: Recipient): string {
  return user.fullName ?? user.email;
}
