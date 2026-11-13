import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import type { Prisma } from '@ota/db';
import { renderPayoutReceiptHtml } from '@ota/documents';
import {
  PAYOUT_MAX_JOBS,
  isFinishedJob,
  payoutAmountCents,
  payoutRecordRefusal,
  workerEarnings,
  workerPayoutState,
  workerToday,
  type PayoutMethod,
  type PayoutRecordRefusal,
  type ServiceType,
} from '@ota/domain';
import type {
  PayableJobDto,
  RecordSupplierPayoutRequest,
  SupplierPaymentDto,
  SupplierPayoutLedgerDto,
  SupplierPayoutsDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { DOCUMENT_RENDERER, type DocumentRenderer } from '../documents/document-renderer';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';
import {
  PAYOUT_CURRENCY,
  PAYOUT_JOB_SELECT,
  centsText,
  finishedJobsWhere,
  payoutCents,
  toEarningsJob,
  toPayoutsDto,
  type PayoutTerms,
} from './payouts';

/** Payments the desk lists on the supplier page, newest first. */
const PAYMENTS_SHOWN = 50;

const REFUSAL_MESSAGE: Record<PayoutRecordRefusal, string> = {
  NO_JOBS: 'Pick at least one job to pay',
  TOO_MANY_JOBS: `At most ${PAYOUT_MAX_JOBS} jobs can be paid at once`,
  NOT_THIS_WORKER: "A picked job is not this worker's",
  CANCELLED: 'A picked job is on a cancelled booking',
  NOT_FINISHED: 'A picked job has not finished yet',
  ALREADY_PAID: 'A picked job is already paid',
  PAID_IN_FUTURE: 'The day paid cannot be after today',
  PAID_BEFORE_END: 'The day paid cannot be before a picked job ended',
};

const PAYABLE_SELECT = {
  ...PAYOUT_JOB_SELECT,
  id: true,
  serviceType: true,
  province: true,
  payoutId: true,
  reservation: { select: { status: true, bookingCode: true } },
} satisfies Prisma.ServiceItemSelect;

const CANDIDATE_SELECT = {
  ...PAYABLE_SELECT,
  supplierId: true,
} satisfies Prisma.ServiceItemSelect;

const PAYMENT_SELECT = {
  id: true,
  method: true,
  currency: true,
  amount: true,
  paidAt: true,
  createdAt: true,
  recordedBy: { select: { fullName: true, email: true } },
  _count: { select: { serviceItems: true } },
} satisfies Prisma.SupplierPayoutSelect;

type PaymentRow = Prisma.SupplierPayoutGetPayload<{ select: typeof PAYMENT_SELECT }>;

function toPaymentDto(row: PaymentRow): SupplierPaymentDto {
  return {
    id: row.id,
    method: row.method as PayoutMethod,
    currency: row.currency,
    amount: row.amount.toFixed(2),
    paidAt: row.paidAt.toISOString().slice(0, 10),
    jobs: row._count.serviceItems,
    recordedBy: row.recordedBy?.fullName?.trim() || row.recordedBy?.email || null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The receipt's printed reference: "PG-" and the payment id's first eight characters. */
export function receiptReference(payoutId: string): string {
  return `PG-${payoutId.slice(0, 8).toUpperCase()}`;
}

/**
 * W-Earnings payouts (`docs/schema-w-earnings.md`, approved E1–E8): the
 * totals and pay day, the desk's record of a payment, the payments list and
 * the receipt PDF. A payment is recorded after the money changed hands; no
 * money moves from here.
 */
@Injectable()
export class SupplierPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
  ) {}

  /** E4: the business days from the thresholds, the office's sessions from the manifest. */
  async terms(): Promise<PayoutTerms> {
    const thresholds = await this.settings.thresholds();
    return {
      businessDays: thresholds.payoutBusinessDays,
      sessions: this.tenant.workerPayouts.sessions,
      office: this.tenant.workerPayouts.office,
    };
  }

  /**
   * The worker's payouts over their finished jobs: what the inspector shows
   * and the worker app's totals.
   */
  async summary(
    supplierId: string,
    method: PayoutMethod | null,
    now: Date = new Date(),
  ): Promise<SupplierPayoutsDto> {
    const [items, terms] = await Promise.all([
      this.prisma.serviceItem.findMany({
        where: finishedJobsWhere(supplierId, now),
        select: PAYOUT_JOB_SELECT,
      }),
      this.terms(),
    ]);
    const jobs = items.map(toEarningsJob);
    return toPayoutsDto(workerEarnings(jobs, now), jobs, method, terms, now);
  }

  /** The worker's payments, newest first, as the desk lists them. */
  async payments(supplierId: string, take: number = PAYMENTS_SHOWN) {
    const rows = await this.prisma.supplierPayout.findMany({
      where: { supplierId },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      take,
      select: PAYMENT_SELECT,
    });
    return rows.map(toPaymentDto);
  }

  /** "Record payout…": the finished jobs not yet paid, oldest first, and the payments made. */
  async ledger(
    supplierId: string,
    now: Date = new Date(),
  ): Promise<SupplierPayoutLedgerDto> {
    await this.requireSupplier(supplierId);
    const [items, payments] = await Promise.all([
      this.prisma.serviceItem.findMany({
        where: { ...finishedJobsWhere(supplierId, now), payoutId: null },
        select: PAYABLE_SELECT,
        orderBy: { serviceDateEnd: 'asc' },
      }),
      this.payments(supplierId),
    ]);
    const payable = items.flatMap((item): PayableJobDto[] => {
      const state = workerPayoutState(item.payoutStatus);
      if (state === 'PAID' || !isFinishedJob(toEarningsJob(item), now)) return [];
      return [
        {
          serviceItemId: item.id,
          serviceType: item.serviceType as ServiceType,
          province: item.province,
          endsAt: item.serviceDateEnd.toISOString(),
          bookingCode: item.reservation.bookingCode,
          payout: item.payoutRate.toFixed(2),
          payoutState: state,
        },
      ];
    });
    return { currency: PAYOUT_CURRENCY, payable, payments };
  }

  /**
   * Record one payment (E1, E7): the jobs' payouts summed, the jobs settled
   * with the payment's id, and the audit row, in one transaction. A job paid
   * by someone else meanwhile fails the update's guard, so the payment is
   * rolled back rather than paid twice.
   */
  async record(
    supplierId: string,
    input: RecordSupplierPayoutRequest,
    actor: AuthUser,
    now: Date = new Date(),
  ): Promise<SupplierPayoutLedgerDto> {
    await this.requireSupplier(supplierId);
    const items = await this.prisma.serviceItem.findMany({
      where: { id: { in: input.serviceItemIds } },
      select: CANDIDATE_SELECT,
    });
    const jobs = items.map((item) => ({
      ...toEarningsJob(item),
      supplierId: item.supplierId,
      payoutId: item.payoutId,
    }));
    const refusal = payoutRecordRefusal(
      supplierId,
      input.serviceItemIds.length,
      jobs,
      input.paidAt,
      now,
    );
    if (refusal) throw new UnprocessableEntityException(REFUSAL_MESSAGE[refusal]);

    const amount = centsText(payoutAmountCents(jobs));
    await this.prisma.$transaction(async (tx) => {
      const payout = await tx.supplierPayout.create({
        data: {
          supplierId,
          method: input.method,
          currency: PAYOUT_CURRENCY,
          amount,
          paidAt: new Date(`${input.paidAt}T00:00:00Z`),
          recordedById: actor.id,
        },
        select: { id: true },
      });
      const settled = await tx.serviceItem.updateMany({
        where: {
          id: { in: input.serviceItemIds },
          supplierId,
          payoutId: null,
          payoutStatus: { not: 'SETTLED' },
        },
        data: { payoutId: payout.id, payoutStatus: 'SETTLED' },
      });
      if (settled.count !== input.serviceItemIds.length) {
        throw new ConflictException(
          'A picked job was paid meanwhile; reload and try again',
        );
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          action: 'supplier.payout_recorded',
          entityType: 'SupplierProfile',
          entityId: supplierId,
          metadata: {
            payoutId: payout.id,
            method: input.method,
            currency: PAYOUT_CURRENCY,
            amount,
            paidAt: input.paidAt,
            serviceItemIds: input.serviceItemIds,
          },
        },
      });
    });
    return this.ledger(supplierId, now);
  }

  /**
   * The receipt for one payment (E5): rendered on demand from the payment
   * and its jobs, never stored. `supplierId` scopes the read, so the desk's
   * route and the worker's own both 404 on another worker's payment.
   */
  async receipt(
    payoutId: string,
    supplierId: string,
  ): Promise<{ body: Uint8Array; filename: string }> {
    const payout = await this.prisma.supplierPayout.findFirst({
      where: { id: payoutId, supplierId },
      select: {
        id: true,
        method: true,
        currency: true,
        amount: true,
        paidAt: true,
        supplier: {
          select: {
            primaryPhone: true,
            rtnLicenseNumber: true,
            user: { select: { fullName: true, email: true } },
          },
        },
        serviceItems: {
          select: {
            serviceType: true,
            province: true,
            serviceDateEnd: true,
            payoutRate: true,
            reservation: { select: { bookingCode: true } },
          },
          orderBy: { serviceDateEnd: 'asc' },
        },
      },
    });
    if (!payout) throw new NotFoundException(`Payment ${payoutId} not found`);

    const reference = receiptReference(payout.id);
    const { branding, emergencyContacts } = this.tenant;
    const html = renderPayoutReceiptHtml(
      {
        reference,
        workerName: payout.supplier.user.fullName?.trim() || payout.supplier.user.email,
        workerPhone: payout.supplier.primaryPhone,
        licenseNumber: payout.supplier.rtnLicenseNumber,
        method: payout.method as PayoutMethod,
        office: this.tenant.workerPayouts.office,
        paidAt: payout.paidAt.toISOString().slice(0, 10),
        currency: payout.currency,
        amount: payout.amount.toFixed(2),
        jobs: payout.serviceItems.map((item) => ({
          endedOn: workerToday(item.serviceDateEnd),
          bookingCode: item.reservation.bookingCode,
          serviceType: item.serviceType,
          province: item.province,
          amount: centsText(payoutCents(item.payoutRate)),
        })),
      },
      {
        agencyName: branding.agencyName,
        licenseNumber: branding.licenseNumber,
        primaryColor: branding.primaryColor,
        supportEmail: branding.supportEmail,
        supportPhone: branding.supportPhone,
        emergencyContacts,
      },
    );
    return {
      body: await this.renderer.render(html),
      filename: `recibo-${reference}.pdf`,
    };
  }

  private async requireSupplier(supplierId: string): Promise<void> {
    const supplier = await this.prisma.supplierProfile.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);
  }
}
