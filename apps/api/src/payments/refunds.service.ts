import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Prisma, RefundReason } from '@ota/db';
import {
  cancellationRefund,
  daysBeforeDeparture,
  refundDecision,
  refundNudge,
  refundWithdrawal,
  REFUND_NUDGE_COOLDOWN_MINUTES,
} from '@ota/domain';
import { refundApprovalNudgeEmail, type Mailer } from '@ota/email';
import type { PaymentProvider, PaymentRail } from '@ota/payments';
import type {
  CreateRefundRequest,
  RefundDto,
  RefundNudgeResultDto,
  RefundQueueQuery,
  RefundQuoteDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { backofficeBaseUrl } from '../common/backoffice-url';
import { MAILER } from '../email/email.module';
import { PrismaService } from '../prisma/prisma.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import { cancellationBandsFor } from './payment-terms';
import { PAYMENT_WRITE_ROLES } from './payment-roles';
import { PAYMENT_PROVIDERS } from './payments.tokens';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { REFUND_INCLUDE, toRefundDto, type RefundRow } from './schedule.service';

/** Refunds that still count against what a receipt can return. */
const LIVE_REFUND_STATUSES = ['REQUESTED', 'APPROVED', 'SENT'] as const;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type Db = Prisma.TransactionClient | PrismaService;

function votesOf(refund: RefundRow) {
  return refund.approvals.map((approval) => ({
    approverId: approval.approverId,
    role: approval.approver.role,
    approve: approval.approve,
  }));
}

function personName(user: { fullName: string | null; email: string }): string {
  return user.fullName?.trim() || user.email;
}

interface Quote {
  paid: number;
  alreadyRefunded: number;
  suggested: number;
  rule: RefundDto['rule'];
}

/**
 * Refunds with their approval chain (M4 D7). A refund names the receipt the
 * money goes back from; the cancellation scale suggests the amount for a
 * traveler cancellation, and a host cancellation or force majeure returns all
 * that is left. Approvals follow the manifest's limits; once approved, a rail
 * whose gateway refunds is called with the refund's id as the idempotency key,
 * and a bank-transfer refund waits for the desk to record the bank reference.
 */
@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(PAYMENT_PROVIDERS)
    private readonly providers: Record<PaymentRail, PaymentProvider>,
    private readonly settings: OperatingSettingsService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async quote(
    reservationId: string,
    receiptId: string,
    reason: RefundReason,
  ): Promise<RefundQuoteDto> {
    const quote = await this.compute(reservationId, receiptId, reason);
    return {
      receiptId,
      paid: quote.paid.toFixed(2),
      alreadyRefunded: quote.alreadyRefunded.toFixed(2),
      suggested: quote.suggested.toFixed(2),
      rule: quote.rule,
    };
  }

  async create(
    reservationId: string,
    input: CreateRefundRequest,
    actor: AuthUser,
  ): Promise<RefundDto> {
    const quote = await this.compute(reservationId, input.receiptId, input.reason);
    const remaining = round2(quote.paid - quote.alreadyRefunded);
    const amount = round2(input.amount ?? quote.suggested);
    if (amount <= 0) {
      throw new BadRequestException(
        'Give the amount to refund: nothing is suggested for this reason',
      );
    }
    if (amount > remaining) {
      throw new BadRequestException(
        `At most ${remaining.toFixed(2)} can still be refunded from this payment`,
      );
    }
    const receipt = await this.prisma.paymentReceipt.findUniqueOrThrow({
      where: { id: input.receiptId },
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.create({
        data: {
          reservationId,
          receiptId: input.receiptId,
          amount,
          currency: receipt.currency,
          reason: input.reason,
          note: input.note,
          // The scale's band applies only to the amount it suggested.
          rule:
            input.amount === undefined && quote.rule
              ? (quote.rule as Prisma.InputJsonValue)
              : undefined,
          requestedById: actor.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'refund.requested',
          entityType: 'Reservation',
          entityId: reservationId,
          metadata: {
            refundId: refund.id,
            receiptId: input.receiptId,
            reason: input.reason,
            amount: amount.toFixed(2),
          },
        },
      });
      return refund;
    });
    return this.load(created.id);
  }

  /**
   * One person's vote; the refund is approved or rejected once its threshold
   * is met. The refund row is locked, so a vote and a withdrawn approval (or
   * two votes) are decided one after the other on the approvals as they are.
   */
  async vote(
    id: string,
    approve: boolean,
    note: string | undefined,
    actor: AuthUser,
  ): Promise<RefundDto> {
    const limits = await this.refundLimits();
    const status = await this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRow(tx, id);
      if (refund.status !== 'REQUESTED') {
        throw new ConflictException(`The refund is already ${refund.status}`);
      }
      if (refund.approvals.some((approval) => approval.approverId === actor.id)) {
        throw new ConflictException('You have already voted on this refund');
      }

      const decision = refundDecision(
        Number(refund.amount),
        [...votesOf(refund), { approverId: actor.id, role: actor.role, approve }],
        limits,
      );
      const next =
        decision.state === 'APPROVED'
          ? 'APPROVED'
          : decision.state === 'REJECTED'
            ? 'REJECTED'
            : 'REQUESTED';

      await tx.refundApproval.create({
        data: { refundId: id, approverId: actor.id, approve, note: note ?? null },
      });
      if (next !== 'REQUESTED') {
        await tx.refund.update({ where: { id }, data: { status: next } });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: approve ? 'refund.approval_given' : 'refund.rejected',
          entityType: 'Reservation',
          entityId: refund.reservationId,
          metadata: { refundId: id, decision: decision.state },
        },
      });
      return next;
    });

    if (status === 'APPROVED') {
      await this.sendThroughGateway(id, actor);
    }
    return this.load(id);
  }

  /**
   * AL-Alerts' "Withdraw": take back one's own approval while the refund
   * still waits on others. The refund stays REQUESTED with the approvals left.
   */
  async withdrawApproval(id: string, actor: AuthUser): Promise<RefundDto> {
    await this.prisma.$transaction(async (tx) => {
      const refund = await this.lockRow(tx, id);
      const refusal = refundWithdrawal(refund.status, votesOf(refund), actor.id);
      if (refusal === 'NOT_PENDING') {
        throw new ConflictException(`The refund is already ${refund.status}`);
      }
      if (refusal === 'NO_APPROVAL') {
        throw new ConflictException('You have no approval on this refund to withdraw');
      }
      await tx.refundApproval.deleteMany({
        where: { refundId: id, approverId: actor.id },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'refund.approval_withdrawn',
          entityType: 'Reservation',
          entityId: refund.reservationId,
          metadata: { refundId: id },
        },
      });
    });
    return this.load(id);
  }

  /**
   * AL-Alerts' "Nudge": email every active approver who has not voted (only
   * Super Admins when one is needed), at most once per cooldown. Email stands
   * in for the design's push and SMS. The nudge is logged before the mail
   * goes out; a failed send is logged and the nudge stands.
   */
  async nudge(id: string, actor: AuthUser): Promise<RefundNudgeResultDto> {
    const limits = await this.refundLimits();
    const now = new Date();
    const { refund, recipients, nudger } = await this.prisma.$transaction(async (tx) => {
      const row = await this.lockRow(tx, id);
      if (row.status !== 'REQUESTED') {
        throw new ConflictException(`The refund is already ${row.status}`);
      }
      const [last, approvers] = await Promise.all([
        tx.auditLog.findFirst({
          where: {
            action: 'refund.nudged',
            entityType: 'Reservation',
            entityId: row.reservationId,
            metadata: { path: ['refundId'], equals: id },
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        }),
        tx.user.findMany({
          where: { role: { in: [...PAYMENT_WRITE_ROLES] }, deactivatedAt: null },
          select: { id: true, role: true, email: true, fullName: true, locale: true },
          orderBy: { email: 'asc' },
        }),
      ]);
      const votes = votesOf(row);
      const outcome = refundNudge({
        decision: refundDecision(Number(row.amount), votes, limits),
        votes,
        approvers,
        actorId: actor.id,
        lastNudgedAt: last?.createdAt ?? null,
        now,
      });
      if (!outcome.ok) {
        throw new ConflictException(
          outcome.refusal === 'TOO_SOON'
            ? `The approvers were nudged less than ${REFUND_NUDGE_COOLDOWN_MINUTES} minutes ago`
            : outcome.refusal === 'NO_ONE_LEFT'
              ? 'No one else can approve this refund'
              : `The refund is already ${row.status}`,
        );
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'refund.nudged',
          entityType: 'Reservation',
          entityId: row.reservationId,
          metadata: { refundId: id, recipients: outcome.recipients.length },
          createdAt: now,
        },
      });
      const found = approvers.find((approver) => approver.id === actor.id);
      return {
        refund: row,
        recipients: approvers.filter((approver) =>
          outcome.recipients.includes(approver.id),
        ),
        nudger: found ? personName(found) : actor.email,
      };
    });

    const decision = refundDecision(Number(refund.amount), votesOf(refund), limits);
    const url = `${backofficeBaseUrl()}/payments#refunds-title`;
    for (const recipient of recipients) {
      try {
        await this.mailer.send(
          refundApprovalNudgeEmail({
            to: recipient.email,
            nudgerName: nudger,
            bookingCode: refund.reservation.bookingCode,
            amount: refund.amount.toFixed(2),
            currency: refund.currency,
            reason: refund.reason,
            approvedBy: refund.approvals
              .filter((approval) => approval.approve)
              .map((approval) => personName(approval.approver)),
            superAdmin: decision.state === 'PENDING' && decision.superAdmin,
            url,
            locale: recipient.locale ?? this.tenant.primaryLocale,
            branding: this.tenant.branding,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Refund ${id} nudge could not be emailed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return {
      nudgedAt: now.toISOString(),
      recipients: recipients.map(personName),
    };
  }

  /** The bank's reference for a refund the agency paid by transfer (wire rail). */
  async markSent(id: string, reference: string, actor: AuthUser): Promise<RefundDto> {
    const refund = await this.loadRow(id);
    if (refund.status !== 'APPROVED') {
      throw new ConflictException(
        refund.status === 'REQUESTED'
          ? 'The refund still needs its approvals'
          : `The refund is already ${refund.status}`,
      );
    }
    const clash = await this.prisma.refund.findUnique({
      where: { providerRefundId: reference },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('That bank reference is already recorded on a refund');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id },
        data: { status: 'SENT', providerRefundId: reference, sentAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'refund.sent',
          entityType: 'Reservation',
          entityId: refund.reservationId,
          metadata: { refundId: id, by: 'bank transfer' },
        },
      });
    });
    return this.load(id);
  }

  /** The A-Payments refund queue: open refunds unless a status is asked, newest first. */
  async queue(query: RefundQueueQuery): Promise<RefundDto[]> {
    const rows = await this.prisma.refund.findMany({
      where: query.status
        ? { status: query.status }
        : { status: { in: ['REQUESTED', 'APPROVED', 'FAILED'] } },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: REFUND_INCLUDE,
    });
    const limits = await this.refundLimits();
    const lastNudged = await this.lastNudges(rows);
    return rows.map((row) => ({
      ...toRefundDto(row, limits),
      lastNudgedAt: lastNudged.get(row.id)?.toISOString() ?? null,
    }));
  }

  /** When each refund's last nudge went out, read from the audit log. */
  private async lastNudges(rows: readonly RefundRow[]): Promise<Map<string, Date>> {
    const last = new Map<string, Date>();
    if (rows.length === 0) {
      return last;
    }
    const nudges = await this.prisma.auditLog.findMany({
      where: {
        action: 'refund.nudged',
        entityType: 'Reservation',
        entityId: { in: [...new Set(rows.map((row) => row.reservationId))] },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, metadata: true },
    });
    for (const nudge of nudges) {
      const refundId = (nudge.metadata as { refundId?: unknown } | null)?.refundId;
      if (typeof refundId === 'string' && !last.has(refundId)) {
        last.set(refundId, nudge.createdAt);
      }
    }
    return last;
  }

  /**
   * Call the gateway for an approved refund on a rail that refunds itself. The
   * refund's id is the idempotency key, so a retry cannot refund twice. A
   * failure marks the refund FAILED for the desk to retry or pay by bank.
   */
  private async sendThroughGateway(id: string, actor: AuthUser): Promise<void> {
    const refund = await this.prisma.refund.findUniqueOrThrow({
      where: { id },
      include: { receipt: true },
    });
    const provider = this.providers[refund.receipt.rail];
    if (!provider.refund || !refund.receipt.gatewayTxId) {
      return;
    }
    let result: { providerRefundId: string } | null = null;
    try {
      result = await provider.refund({
        providerReference: refund.receipt.gatewayTxId,
        amount: Number(refund.amount),
        currency: refund.currency,
        idempotencyKey: refund.id,
      });
    } catch (error) {
      this.logger.error(`Refund ${id} failed at the gateway`, error as Error);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.refund.update({
        where: { id },
        data: result
          ? {
              status: 'SENT',
              providerRefundId: result.providerRefundId,
              sentAt: new Date(),
            }
          : { status: 'FAILED' },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: result ? 'refund.sent' : 'refund.failed',
          entityType: 'Reservation',
          entityId: refund.reservationId,
          metadata: { refundId: id, by: 'gateway' },
        },
      });
    });
  }

  private async compute(
    reservationId: string,
    receiptId: string,
    reason: RefundReason,
  ): Promise<Quote> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        package: { select: { cancellationPolicy: true } },
        payments: { where: { status: 'PAID' } },
        refunds: { where: { status: { in: [...LIVE_REFUND_STATUSES] } } },
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }
    const receipt = reservation.payments.find((payment) => payment.id === receiptId);
    if (!receipt) {
      throw new BadRequestException(
        'Refunds are made from a paid payment of this booking',
      );
    }

    const paid = Number(receipt.amount);
    const alreadyRefunded = reservation.refunds
      .filter((refund) => refund.receiptId === receiptId)
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    const remaining = round2(paid - alreadyRefunded);

    if (reason === 'HOST_CANCELLATION' || reason === 'FORCE_MAJEURE') {
      // Force majeure overrides the policy table, not the approvals.
      return { paid, alreadyRefunded, suggested: remaining, rule: null };
    }
    if (reason !== 'TRAVELER_CANCELLATION') {
      return { paid, alreadyRefunded, suggested: 0, rule: null };
    }

    // The scale is applied to everything paid on the booking (A-Payments:
    // "of the € 590 deposit-plus-balance paid so far"), less what was already
    // refunded on any payment, and drawn from this receipt as far as it goes.
    const policyKey = reservation.package?.cancellationPolicy ?? null;
    const bands = cancellationBandsFor(this.tenant, policyKey);
    const paidOnBooking = reservation.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const daysBefore = daysBeforeDeparture(reservation.startDate, new Date());
    const quote = bands ? cancellationRefund(bands, paidOnBooking, daysBefore) : null;
    if (!quote || !policyKey) {
      return { paid, alreadyRefunded, suggested: 0, rule: null };
    }
    const refundedOnBooking = reservation.refunds.reduce(
      (sum, refund) => sum + Number(refund.amount),
      0,
    );
    return {
      paid,
      alreadyRefunded,
      suggested: Math.max(
        0,
        Math.min(remaining, round2(quote.refund - refundedOnBooking)),
      ),
      rule: {
        policyKey,
        daysBefore,
        fromDays: quote.band.fromDays,
        keepPercent: quote.band.keepPercent,
        fee: quote.band.fee,
        paid: round2(paidOnBooking),
      },
    };
  }

  /** Who must approve a refund, under the limits in force (M4 D7, M9). */
  private async refundLimits() {
    const thresholds = await this.settings.thresholds();
    return {
      singleUpTo: thresholds.refundSingleUpTo,
      dualUpTo: thresholds.refundDualUpTo,
    };
  }

  /** Lock the refund row for the rest of the transaction, then read it. */
  private async lockRow(tx: Prisma.TransactionClient, id: string): Promise<RefundRow> {
    await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${id}::uuid FOR UPDATE`;
    return this.loadRow(id, tx);
  }

  private async loadRow(id: string, db: Db = this.prisma): Promise<RefundRow> {
    const row = await db.refund.findUnique({
      where: { id },
      include: REFUND_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException(`Refund ${id} not found`);
    }
    return row;
  }

  private async load(id: string): Promise<RefundDto> {
    return toRefundDto(await this.loadRow(id), await this.refundLimits());
  }
}
