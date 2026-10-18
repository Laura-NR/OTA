import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import {
  instalmentReminderEmail,
  paymentWindowReminderEmail,
  type Mailer,
} from '@ota/email';
import type { ReminderScanResultDto } from '@ota/schemas';

import { accountReservationUrl } from '../common/storefront-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import {
  REMINDER_SCHEDULER,
  WINDOW_REMINDER_SCHEDULER,
  type ReminderScheduler,
} from './reminders.scheduler';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const REMINDER_DAYS = [7, 3, 1] as const;
const SETTLED_STATUSES = ['CANCELLED', 'COMPLETED'] as const;

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

/**
 * The payment reminder scans (Phase 6). The balance scan (E-Confirmed) emails
 * 7, 3 and 1 days before a balance falls due; the window scan (E-Reminder)
 * emails 24 and 2 hours before the first payment's window closes. The audit
 * log is the sent ledger, so a re-run never sends twice and no migration or
 * extra column is needed.
 */
@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(REMINDER_SCHEDULER) private readonly scheduler: ReminderScheduler,
    @Inject(WINDOW_REMINDER_SCHEDULER)
    private readonly windowScheduler: ReminderScheduler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.schedule(async () => {
      await this.scan();
    });
    await this.windowScheduler.schedule(async () => {
      await this.scanWindows();
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.close();
    await this.windowScheduler.close();
  }

  /**
   * The balance reminders. A deposit or full payment is a payment window,
   * measured in hours, so it is left to `scanWindows`.
   */
  async scan(now = new Date()): Promise<ReminderScanResultDto> {
    const today = startOfUtcDay(now);
    const instalments = await this.prisma.paymentInstalment.findMany({
      where: {
        status: 'DUE',
        kind: 'BALANCE',
        dueAt: { gte: addDays(today, 1), lt: addDays(today, 8) },
      },
      include: {
        reservation: {
          include: {
            user: {
              select: {
                email: true,
                fullName: true,
                locale: true,
                anonymizedAt: true,
              },
            },
          },
        },
      },
    });

    let sent = 0;
    for (const instalment of instalments) {
      const days = Math.round(
        (startOfUtcDay(instalment.dueAt).getTime() - today.getTime()) / DAY_MS,
      );
      if (!REMINDER_DAYS.includes(days as (typeof REMINDER_DAYS)[number])) {
        continue;
      }
      const { reservation } = instalment;
      if (
        reservation.user.anonymizedAt ||
        SETTLED_STATUSES.includes(reservation.status as (typeof SETTLED_STATUSES)[number])
      ) {
        continue;
      }

      const alreadySent = await this.prisma.auditLog.findFirst({
        where: {
          action: 'payment.reminder_sent',
          entityType: 'PaymentInstalment',
          entityId: instalment.id,
          metadata: { path: ['days'], equals: days },
        },
        select: { id: true },
      });
      if (alreadySent) {
        continue;
      }

      try {
        await this.mailer.send(
          instalmentReminderEmail({
            to: reservation.user.email,
            name: reservation.user.fullName ?? reservation.user.email,
            bookingCode: reservation.bookingCode,
            kind: instalment.kind,
            amount: Number(instalment.amount),
            currency: instalment.currency,
            dueAt: instalment.dueAt,
            daysUntil: days as 1 | 3 | 7,
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
        this.logger.warn(
          `Instalment reminder failed for ${reservation.bookingCode} (${instalment.id}): ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        continue;
      }

      await this.prisma.auditLog.create({
        data: {
          action: 'payment.reminder_sent',
          entityType: 'PaymentInstalment',
          entityId: instalment.id,
          metadata: {
            days,
            dueAt: instalment.dueAt.toISOString(),
            kind: instalment.kind,
            bookingCode: reservation.bookingCode,
          },
        },
      });
      sent += 1;
    }

    if (sent > 0) {
      this.logger.log(`Instalment reminders: ${sent} email(s) sent`);
    }
    return { sent };
  }

  /**
   * E-Reminder: 24 hours and 2 hours before a deposit's or full payment's
   * window closes. Only the most pressing reminder not yet sent goes out, and
   * each is recorded against the deadline it announced, so a window the desk
   * extends gets its reminders again for the new deadline.
   */
  async scanWindows(now = new Date()): Promise<ReminderScanResultDto> {
    const instalments = await this.prisma.paymentInstalment.findMany({
      where: {
        status: 'DUE',
        kind: { in: ['DEPOSIT', 'FULL'] },
        dueAt: { gt: now, lte: new Date(now.getTime() + 24 * HOUR_MS) },
      },
      include: {
        reservation: {
          include: {
            user: {
              select: {
                email: true,
                fullName: true,
                locale: true,
                anonymizedAt: true,
              },
            },
          },
        },
      },
    });

    let sent = 0;
    for (const instalment of instalments) {
      const { reservation } = instalment;
      if (
        reservation.user.anonymizedAt ||
        SETTLED_STATUSES.includes(reservation.status as (typeof SETTLED_STATUSES)[number])
      ) {
        continue;
      }
      const hoursLeft: 24 | 2 =
        instalment.dueAt.getTime() - now.getTime() <= 2 * HOUR_MS ? 2 : 24;
      const dueAt = instalment.dueAt.toISOString();
      const alreadySent = await this.prisma.auditLog.findFirst({
        where: {
          action: 'payment.window_reminder_sent',
          entityType: 'PaymentInstalment',
          entityId: instalment.id,
          AND: [
            { metadata: { path: ['hours'], equals: hoursLeft } },
            { metadata: { path: ['dueAt'], equals: dueAt } },
          ],
        },
        select: { id: true },
      });
      if (alreadySent) {
        continue;
      }

      try {
        await this.mailer.send(
          paymentWindowReminderEmail({
            to: reservation.user.email,
            name: reservation.user.fullName ?? reservation.user.email,
            bookingCode: reservation.bookingCode,
            kind: instalment.kind as 'DEPOSIT' | 'FULL',
            amount: Number(instalment.amount),
            currency: instalment.currency,
            dueAt: instalment.dueAt,
            hoursLeft,
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
        this.logger.warn(
          `Payment window reminder failed for ${reservation.bookingCode} (${instalment.id}): ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        continue;
      }

      await this.prisma.auditLog.create({
        data: {
          action: 'payment.window_reminder_sent',
          entityType: 'PaymentInstalment',
          entityId: instalment.id,
          metadata: {
            hours: hoursLeft,
            dueAt,
            kind: instalment.kind,
            bookingCode: reservation.bookingCode,
          },
        },
      });
      sent += 1;
    }

    if (sent > 0) {
      this.logger.log(`Payment window reminders: ${sent} email(s) sent`);
    }
    return { sent };
  }
}
