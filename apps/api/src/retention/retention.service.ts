import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { Prisma, Role } from '@ota/db';
import {
  isRetentionNoticeDue,
  isRetentionPurgeDue,
  retentionPurgeAt,
  retentionStatus,
  type RetentionClock,
} from '@ota/domain';
import { retentionNoticeEmail, type Mailer } from '@ota/email';
import type {
  ListRetentionQuery,
  RetentionPendingUserDto,
  RetentionScanResultDto,
} from '@ota/schemas';

import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { signRetentionToken, verifyRetentionToken } from './retention-token';
import { RETENTION_SCHEDULER, type RetentionScheduler } from './retention.scheduler';

const STATUS_ORDER: Record<string, number> = {
  PURGE_DUE: 0,
  GRACE_PERIOD: 1,
  NOTICE_DUE: 2,
  ANONYMIZED: 3,
};

export interface KeepAliveResult {
  status: number;
  html: string;
}

interface RetentionUserRow {
  id: string;
  email: string;
  fullName: string | null;
  retentionNoticeSentAt: Date | null;
  retentionConsentGrantedAt: Date | null;
  anonymizedAt: Date | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** Free-text keys that must not survive anonymization in audit metadata. */
const PII_AUDIT_KEYS = ['reason', 'note', 'email', 'declineReason'];

/**
 * Remove free-text PII keys from an audit metadata object. Returns undefined
 * when there is nothing to change, so the caller can skip the write.
 */
function redactAuditMetadata(
  metadata: Prisma.JsonValue | null,
): Prisma.JsonObject | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  let changed = false;
  const cleaned: Prisma.JsonObject = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (PII_AUDIT_KEYS.includes(key)) {
      changed = true;
      continue;
    }
    cleaned[key] = value as Prisma.JsonValue;
  }
  return changed ? cleaned : undefined;
}

/**
 * GDPR retention lifecycle (spec §3.5). Sends the 6-month keep-alive notice,
 * honors the tokenized confirmation, and anonymizes records whose 30-day grace
 * period lapsed — scrubbing PII while keeping the reservation/payment/audit rows
 * that back the fiscal aggregates.
 */
@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(RETENTION_SCHEDULER) private readonly scheduler: RetentionScheduler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.schedule(async () => {
      await this.scan();
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.close();
  }

  /** One pass of the lifecycle job: notices first, then due purges. */
  async scan(): Promise<RetentionScanResultDto> {
    const now = new Date();
    const noticed = await this.sendDueNotices(now);
    const purged = await this.purgeExpired(now);
    if (noticed > 0 || purged > 0) {
      this.logger.log(
        `Retention scan: ${noticed} notice(s) sent, ${purged} record(s) anonymized`,
      );
    }
    return { noticed, purged };
  }

  /** Travelers whose lifecycle is not simply ACTIVE, most urgent first. */
  async listPending(query: ListRetentionQuery): Promise<RetentionPendingUserDto[]> {
    const now = new Date();
    const completions = await this.prisma.reservation.groupBy({
      by: ['userId'],
      where: { completedAt: { not: null }, user: { role: Role.TRAVELER } },
      _max: { completedAt: true },
    });

    const pending: RetentionPendingUserDto[] = [];
    for (const row of completions) {
      const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
      if (!user || user.role !== Role.TRAVELER) {
        continue;
      }
      const dto = this.toPendingDto(
        {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          retentionNoticeSentAt: user.retentionNoticeSentAt,
          retentionConsentGrantedAt: user.retentionConsentGrantedAt,
          anonymizedAt: user.anonymizedAt,
        },
        row._max.completedAt,
        now,
      );
      if (dto) {
        pending.push(dto);
      }
    }

    pending.sort((a, b) => {
      const byStatus = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      if (byStatus !== 0) {
        return byStatus;
      }
      return (a.purgeAt ?? '').localeCompare(b.purgeAt ?? '');
    });

    return pending.slice(0, query.limit);
  }

  /**
   * Grant the keep-alive confirmation for a token. Returns an HTML page and an
   * HTTP status so the email link resolves to a readable, branded result.
   */
  async confirmKeepAlive(token: string): Promise<KeepAliveResult> {
    const secret = process.env.AUTH_SECRET;
    const payload = secret ? verifyRetentionToken(token, secret) : null;
    if (!payload) {
      return this.keepAlivePage(
        400,
        'This link is invalid or has expired. Please contact the agency if you still wish to keep your account.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, anonymizedAt: true },
    });
    if (!user) {
      return this.keepAlivePage(400, 'This link is invalid or has expired.');
    }
    if (user.anonymizedAt) {
      return this.keepAlivePage(
        409,
        'This account has already been anonymized and can no longer be restored.',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { retentionConsentGrantedAt: now },
      });
      await tx.auditLog.create({
        data: {
          action: 'retention.consent_granted',
          entityType: 'User',
          entityId: user.id,
          metadata: {},
        },
      });
    });

    return this.keepAlivePage(
      200,
      'Thank you. Your account will stay active for another 12 months.',
    );
  }

  private async sendDueNotices(now: Date): Promise<number> {
    const completions = await this.prisma.reservation.groupBy({
      by: ['userId'],
      where: { completedAt: { not: null }, user: { role: Role.TRAVELER } },
      _max: { completedAt: true },
    });

    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      this.logger.error('AUTH_SECRET is not set; cannot send retention notices');
      return 0;
    }

    let noticed = 0;
    for (const row of completions) {
      const latestCompletedAt = row._max.completedAt;
      if (!latestCompletedAt) {
        continue;
      }
      const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
      if (!user || user.role !== Role.TRAVELER) {
        continue;
      }
      const clock: RetentionClock = {
        latestCompletedAt,
        noticeSentAt: user.retentionNoticeSentAt,
        consentGrantedAt: user.retentionConsentGrantedAt,
        anonymizedAt: user.anonymizedAt,
      };
      if (!isRetentionNoticeDue(clock, now)) {
        continue;
      }

      const purgeAt = retentionPurgeAt(now);
      const token = signRetentionToken({
        userId: user.id,
        expiresAt: purgeAt,
        secret: authSecret,
      });

      try {
        await this.mailer.send(
          retentionNoticeEmail({
            to: user.email,
            keepAliveUrl: `${this.linkBaseUrl()}/retention/keep-alive?token=${encodeURIComponent(token)}`,
            purgeAt,
            branding: this.tenant.branding,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Retention notice failed for user ${user.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { retentionNoticeSentAt: now },
        });
        await tx.auditLog.create({
          data: {
            action: 'retention.notice_sent',
            entityType: 'User',
            entityId: user.id,
            metadata: { purgeAt: purgeAt.toISOString() },
          },
        });
      });
      noticed += 1;
    }

    return noticed;
  }

  private async purgeExpired(now: Date): Promise<number> {
    const candidates = await this.prisma.user.findMany({
      where: {
        role: Role.TRAVELER,
        anonymizedAt: null,
        retentionNoticeSentAt: { not: null },
      },
    });

    let purged = 0;
    for (const user of candidates) {
      const clock: RetentionClock = {
        latestCompletedAt: null,
        noticeSentAt: user.retentionNoticeSentAt,
        consentGrantedAt: user.retentionConsentGrantedAt,
        anonymizedAt: user.anonymizedAt,
      };
      if (!isRetentionPurgeDue(clock, now)) {
        continue;
      }
      await this.anonymize(user.id, user.email, now);
      purged += 1;
    }

    return purged;
  }

  /**
   * Scrub the traveler's PII and revoke their credentials in one transaction.
   * Fiscal rows (reservation totals, service items, payment receipts, audit
   * trail) are kept, but free-text PII on the traveler's bookings is redacted
   * (`docs/pii-at-rest-review.md`, Tier 1).
   */
  private async anonymize(userId: string, email: string, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const reservations = await tx.reservation.findMany({
        where: { userId },
        select: { id: true, serviceItems: { select: { id: true } } },
      });
      const reservationIds = reservations.map((reservation) => reservation.id);
      const serviceItemIds = reservations.flatMap((reservation) =>
        reservation.serviceItems.map((item) => item.id),
      );

      // Redact reservation-scoped free text; keep the rows (sender, rating,
      // severity, dates) so aggregate metrics survive.
      await tx.reservation.updateMany({
        where: { userId },
        data: { customItineraryPayload: Prisma.DbNull },
      });
      await tx.message.updateMany({
        where: { reservationId: { in: reservationIds } },
        data: { body: '[redacted]' },
      });
      await tx.review.updateMany({
        where: { reservationId: { in: reservationIds } },
        data: { comment: null },
      });
      await tx.incident.updateMany({
        where: { reservationId: { in: reservationIds } },
        data: { description: '[redacted]' },
      });
      await tx.serviceItem.updateMany({
        where: { reservationId: { in: reservationIds } },
        data: { declineReason: null },
      });
      if (serviceItemIds.length > 0) {
        await tx.dispatchOffer.updateMany({
          where: { serviceItemId: { in: serviceItemIds } },
          data: { declineReason: null },
        });
      }

      // Better Auth verification rows are keyed by the old address.
      await tx.verification.deleteMany({
        where: { identifier: { contains: email } },
      });

      // Strip free-text PII keys from the traveler's audit metadata.
      if (reservationIds.length > 0 || serviceItemIds.length > 0) {
        const audits = await tx.auditLog.findMany({
          where: {
            OR: [
              { entityType: 'Reservation', entityId: { in: reservationIds } },
              { entityType: 'ServiceItem', entityId: { in: serviceItemIds } },
            ],
          },
          select: { id: true, metadata: true },
        });
        for (const audit of audits) {
          const cleaned = redactAuditMetadata(audit.metadata);
          if (cleaned) {
            await tx.auditLog.update({
              where: { id: audit.id },
              data: { metadata: cleaned },
            });
          }
        }
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          email: `anonymized+${userId}@anonymized.invalid`,
          fullName: null,
          phone: null,
          image: null,
          nationality: null,
          anonymizedAt: now,
        },
      });
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.passkey.deleteMany({ where: { userId } });
      await tx.auditLog.create({
        data: {
          action: 'retention.anonymized',
          entityType: 'User',
          entityId: userId,
          metadata: {},
        },
      });
    });
  }

  private toPendingDto(
    user: RetentionUserRow,
    latestCompletedAt: Date | null,
    now: Date,
  ): RetentionPendingUserDto | null {
    const clock: RetentionClock = {
      latestCompletedAt,
      noticeSentAt: user.retentionNoticeSentAt,
      consentGrantedAt: user.retentionConsentGrantedAt,
      anonymizedAt: user.anonymizedAt,
    };
    const status = retentionStatus(clock, now);
    if (status === 'ACTIVE') {
      return null;
    }

    const purgeAt = user.anonymizedAt
      ? user.anonymizedAt
      : user.retentionNoticeSentAt
        ? retentionPurgeAt(user.retentionNoticeSentAt)
        : null;

    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      status,
      latestCompletedAt: iso(latestCompletedAt),
      noticeSentAt: iso(user.retentionNoticeSentAt),
      consentGrantedAt: iso(user.retentionConsentGrantedAt),
      purgeAt: iso(purgeAt),
    };
  }

  private linkBaseUrl(): string {
    return (
      process.env.API_PUBLIC_URL ??
      process.env.BETTER_AUTH_URL ??
      `http://localhost:${process.env.PORT ?? 3001}`
    );
  }

  private keepAlivePage(status: number, message: string): KeepAliveResult {
    const { agencyName, primaryColor, licenseNumber } = this.tenant.branding;
    const html = `<!doctype html>
<html>
<body style="font-family: Arial, Helvetica, sans-serif; color: #1f2937; max-width: 480px; margin: 40px auto;">
  <h1 style="color: ${escapeHtml(primaryColor)}; font-size: 20px;">${escapeHtml(agencyName)}</h1>
  <p>${escapeHtml(message)}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;" />
  <p style="color:#6b7280;font-size:11px;">
    ${escapeHtml(agencyName)} · MINTUR License ${escapeHtml(licenseNumber)}
  </p>
</body>
</html>`;
    return { status, html };
  }
}
