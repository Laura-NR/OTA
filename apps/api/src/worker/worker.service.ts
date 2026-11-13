import {
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Prisma } from '@ota/db';
import {
  JOB_STATUSES,
  RELIABILITY_MIN_ANSWERED,
  ReservationStatus,
  ServiceItemStatus,
  SupplierCategory,
  WORKER_BLOCK_MAX_DAYS,
  calculateSupplierReliability,
  daysBetween,
  isResourcesStale,
  longBlockedRun,
  monthDays,
  planWorkerDays,
  workerBlockReason,
  workerDayStates,
  workerDaysRefusal,
  workerEarnings,
  workerHorizon,
  workerReliability,
  workerToday,
  type PayoutMethod,
  type ServiceType,
  type VerificationStatus,
  type WorkerDaysRefusal,
} from '@ota/domain';
import type {
  DeclareWorkerFuelRequest,
  SetWorkerDaysRequest,
  WorkerCalendarDto,
  WorkerCalendarQuery,
  WorkerDaysResultDto,
  WorkerEarningsDto,
  WorkerFuelDto,
  WorkerHomeDto,
  WorkerJobDto,
  WorkerOfferDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import {
  PAYOUT_CURRENCY,
  PAYOUT_JOB_SELECT,
  finishedJobsWhere,
  toEarningsJob,
  toPayoutsDto,
} from '../suppliers/payouts';
import { SupplierPayoutsService } from '../suppliers/supplier-payouts.service';
import { SuppliersService } from '../suppliers/suppliers.service';

/** Coming jobs W-Home lists ("Hoy", "Esta semana" and on). */
const JOBS_SHOWN = 20;

const ITEM_SELECT = {
  id: true,
  serviceType: true,
  province: true,
  serviceDateStart: true,
  serviceDateEnd: true,
  offeredAt: true,
  dispatchDeadline: true,
  payoutRate: true,
  reservation: {
    select: {
      bookingCode: true,
      partySize: true,
      user: { select: { fullName: true, locale: true } },
    },
  },
} satisfies Prisma.ServiceItemSelect;

type WorkerItem = Prisma.ServiceItemGetPayload<{ select: typeof ITEM_SELECT }>;

/** A finished job as W-Earnings reads it: the job plus its payout, payment and booking state. */
const EARNINGS_SELECT = {
  ...ITEM_SELECT,
  ...PAYOUT_JOB_SELECT,
  reservation: { select: { ...ITEM_SELECT.reservation.select, status: true } },
} satisfies Prisma.ServiceItemSelect;

/** Payments W-Earnings' "Recibos" lists. */
const PAYMENTS_SHOWN = 12;

function firstName(fullName: string | null): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** A `YYYY-MM-DD` day as the date column stores it. */
function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

const DAYS_REFUSAL_MESSAGE: Record<WorkerDaysRefusal, string> = {
  BAD_RANGE: 'The range ends before it starts',
  PAST: 'Days before today cannot be changed',
  TOO_FAR: 'Days more than twelve months ahead cannot be changed yet',
  TOO_MANY_DAYS: `At most ${WORKER_BLOCK_MAX_DAYS} days can be changed at once`,
};

function serviceSpan(item: WorkerItem): { start: Date; end: Date } {
  return { start: item.serviceDateStart, end: item.serviceDateEnd };
}

/** The fuel reserve as last declared or confirmed; never declared reads as stale. */
function toFuel(
  resources: { fuelReserveLitres: number | null; confirmedAt: Date } | null,
  now: Date,
  staleDays: number,
): WorkerFuelDto {
  return resources
    ? {
        litres: resources.fuelReserveLitres,
        declaredAt: resources.confirmedAt.toISOString(),
        stale: isResourcesStale(resources.confirmedAt, now, staleDays),
      }
    : { litres: null, declaredAt: null, stale: true };
}

/**
 * The worker app's reads (W-Home, W-Offer, W-Earnings) and calendar (W-Calendar), always
 * scoped to the caller's own supplier profile. Travelers appear by first
 * name, language and party size only (W-Login: "Nunca direcciones ni pagos").
 */
@Injectable()
export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
    private readonly suppliers: SuppliersService,
    private readonly payouts: SupplierPayoutsService,
  ) {}

  async home(actor: AuthUser, now: Date = new Date()): Promise<WorkerHomeDto> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        category: true,
        provincesActive: true,
        verificationStatus: true,
        credentialExpiresAt: true,
        user: { select: { fullName: true } },
      },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }

    const [offers, jobs, ledger, thresholds] = await Promise.all([
      this.prisma.serviceItem.findMany({
        where: {
          supplierId: profile.id,
          status: ServiceItemStatus.Offered,
          dispatchDeadline: { gt: now },
        },
        orderBy: { dispatchDeadline: 'asc' },
        select: ITEM_SELECT,
      }),
      this.prisma.serviceItem.findMany({
        where: {
          supplierId: profile.id,
          status: ServiceItemStatus.Accepted,
          serviceDateEnd: { gte: startOfDay(now) },
        },
        orderBy: { serviceDateStart: 'asc' },
        take: JOBS_SHOWN,
        select: ITEM_SELECT,
      }),
      this.prisma.dispatchOffer.findMany({
        where: { supplierId: profile.id },
        select: { supplierId: true, status: true, offeredAt: true, respondedAt: true },
      }),
      this.settings.thresholds(),
    ]);
    const [card] = calculateSupplierReliability(ledger);
    const hurryShare = thresholds.amberPercent / 100;

    return {
      worker: {
        firstName: firstName(profile.user.fullName),
        category: profile.category as SupplierCategory,
        provinces: profile.provincesActive,
        verificationStatus: profile.verificationStatus as VerificationStatus,
        credentialExpiresAt: profile.credentialExpiresAt?.toISOString() ?? null,
        reliability:
          card && card.answered >= RELIABILITY_MIN_ANSWERED
            ? Math.round(card.acceptanceRate * 100)
            : null,
      },
      offers: offers.flatMap((item) => this.toOffer(item, hurryShare)),
      jobs: jobs.map((item) => this.toJob(item)),
      serverTime: now.toISOString(),
    };
  }

  /**
   * W-Earnings: the worker's reliability as the desk's floor reads it, their
   * payouts over finished jobs with their method and next pay day, the latest
   * of those jobs and their payments.
   */
  async earnings(actor: AuthUser, now: Date = new Date()): Promise<WorkerEarningsDto> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        category: true,
        provincesActive: true,
        payoutMethod: true,
        user: { select: { fullName: true } },
      },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }

    const [items, ledger, thresholds, terms, payments] = await Promise.all([
      this.prisma.serviceItem.findMany({
        where: finishedJobsWhere(profile.id, now),
        select: EARNINGS_SELECT,
      }),
      this.prisma.dispatchOffer.findMany({
        where: { supplierId: profile.id },
        select: { supplierId: true, status: true, offeredAt: true, respondedAt: true },
      }),
      this.settings.thresholds(),
      this.payouts.terms(),
      this.payouts.payments(profile.id, PAYMENTS_SHOWN),
    ]);
    const jobs = items.map((item) => ({ item, ...toEarningsJob(item) }));
    const earnings = workerEarnings(jobs, now);

    return {
      worker: {
        fullName: profile.user.fullName?.trim() || null,
        category: profile.category as SupplierCategory,
        provinces: profile.provincesActive,
      },
      reliability: workerReliability(
        ledger,
        thresholds.reliabilityFloorPercent,
        thresholds.reliabilityMinAnswered,
      ),
      payouts: toPayoutsDto(
        earnings,
        jobs,
        profile.payoutMethod as PayoutMethod | null,
        terms,
        now,
      ),
      history: earnings.history.map((job) => ({
        ...this.toJob(job.item),
        payoutState: job.payoutState,
        paidAt: job.paidAt ? job.paidAt.toISOString().slice(0, 10) : null,
      })),
      // Who recorded a payment is the desk's business, not the worker's.
      payments: payments.map((payment) => ({
        id: payment.id,
        method: payment.method,
        currency: payment.currency,
        amount: payment.amount,
        paidAt: payment.paidAt,
        jobs: payment.jobs,
      })),
    };
  }

  /** W-Earnings E5: the receipt of one of the worker's own payments; another's is a 404. */
  async receipt(
    actor: AuthUser,
    payoutId: string,
  ): Promise<{ body: Uint8Array; filename: string }> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }
    return this.payouts.receipt(payoutId, profile.id);
  }

  /**
   * W-Calendar's month: each day's state, the jobs and open offers on it, the
   * first long block ahead and, for a driver, the fuel reserve.
   */
  async calendar(
    actor: AuthUser,
    query: WorkerCalendarQuery,
    now: Date = new Date(),
  ): Promise<WorkerCalendarDto> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: {
        id: true,
        category: true,
        resources: { select: { fuelReserveLitres: true, confirmedAt: true } },
      },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }

    const today = workerToday(now);
    const month = query.month ?? today.slice(0, 7);
    const days = monthDays(month);
    const first = days[0]!;
    const last = days.at(-1)!;
    const fromDay = first < today ? first : today;
    const [blockedRows, { jobs, offers }, thresholds] = await Promise.all([
      this.prisma.availability.findMany({
        where: {
          supplierId: profile.id,
          isAvailable: false,
          date: { gte: dayDate(fromDay) },
        },
        select: { date: true, blockReason: true },
      }),
      this.services(profile.id, first, last, now),
      this.settings.thresholds(),
    ]);
    const blocked = blockedRows.map((row) => row.date.toISOString().slice(0, 10));
    const reasons = new Map(
      blockedRows.map((row) => [row.date.toISOString().slice(0, 10), row.blockReason]),
    );
    const states = workerDayStates(
      days,
      new Set(blocked.filter((day) => day >= first && day <= last)),
      jobs.map(serviceSpan),
      offers.map(serviceSpan),
    );
    const hurryShare = thresholds.amberPercent / 100;

    return {
      month,
      today,
      horizon: workerHorizon(today),
      days: days.map((date) => {
        const state = states.get(date)!;
        return {
          date,
          state,
          reason: state === 'BLOCKED' ? (reasons.get(date) ?? null) : null,
        };
      }),
      jobs: jobs.map((item) => this.toJob(item)),
      offers: offers.flatMap((item) => this.toOffer(item, hurryShare)),
      longBlock: longBlockedRun(blocked, today),
      fuel:
        profile.category === SupplierCategory.PrivateDriver
          ? toFuel(profile.resources, now, thresholds.resourcesStaleDays)
          : null,
    };
  }

  /**
   * "Bloquear este día", "Bloquear varios días" and "Volver a estar
   * disponible": sets each day of the range, except days with a job or an
   * open offer, which are left as they are and reported. A blocked day keeps
   * the reason picked ("Otro" when none); a freed day loses it. Audited once
   * per change as `supplier.availability_set` with `via: WORKER_APP`.
   */
  async setDays(
    actor: AuthUser,
    input: SetWorkerDaysRequest,
    now: Date = new Date(),
  ): Promise<WorkerDaysResultDto> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }
    const today = workerToday(now);
    const refusal = workerDaysRefusal(input.from, input.to, today);
    if (refusal) {
      throw new UnprocessableEntityException(DAYS_REFUSAL_MESSAGE[refusal]);
    }

    const days = daysBetween(input.from, input.to);
    const { jobs, offers } = await this.services(profile.id, input.from, input.to, now);
    const { change, kept } = planWorkerDays(
      days,
      workerDayStates(days, new Set(), jobs.map(serviceSpan), offers.map(serviceSpan)),
    );

    if (change.length > 0) {
      const dates = change.map(dayDate);
      const blockReason = workerBlockReason(input.isAvailable, input.reason);
      await this.prisma.$transaction(async (tx) => {
        await tx.availability.updateMany({
          where: { supplierId: profile.id, date: { in: dates } },
          data: { isAvailable: input.isAvailable, blockReason },
        });
        await tx.availability.createMany({
          data: dates.map((date) => ({
            supplierId: profile.id,
            date,
            isAvailable: input.isAvailable,
            blockReason,
          })),
          skipDuplicates: true,
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'supplier.availability_set',
            entityType: 'SupplierProfile',
            entityId: profile.id,
            metadata: {
              from: input.from,
              to: input.to,
              isAvailable: input.isAvailable,
              reason: blockReason,
              days: change,
              via: 'WORKER_APP',
            },
          },
        });
      });
    }

    const blocked = await this.prisma.availability.findMany({
      where: {
        supplierId: profile.id,
        isAvailable: false,
        date: { gte: dayDate(today) },
      },
      select: { date: true },
    });
    return {
      changed: change,
      kept,
      longBlock: longBlockedRun(
        blocked.map((row) => row.date.toISOString().slice(0, 10)),
        today,
      ),
    };
  }

  /**
   * W-Calendar's "Combustible en reserva" for drivers: recorded through the
   * desk's resources path as a `WORKER_APP` confirmation, audited as
   * `supplier.resources_confirmed`. A driver's resources are the fuel
   * reserve alone, so the row is replaced with it.
   */
  async declareFuel(
    actor: AuthUser,
    input: DeclareWorkerFuelRequest,
    now: Date = new Date(),
  ): Promise<WorkerFuelDto> {
    const profile = await this.prisma.supplierProfile.findUnique({
      where: { userId: actor.id },
      select: { id: true, category: true },
    });
    if (!profile) {
      throw new ForbiddenException('No supplier profile is linked to this account');
    }
    if (profile.category !== SupplierCategory.PrivateDriver) {
      throw new UnprocessableEntityException('Only drivers declare a fuel reserve');
    }
    await this.suppliers.recordResources(
      profile.id,
      {
        via: 'WORKER_APP',
        generator: null,
        generatorHoursPerDay: null,
        generatorSchedule: null,
        generatorFuelDays: null,
        solarBatteryKwh: null,
        waterTankLitres: null,
        rooms: null,
        guestCapacity: null,
        fuelReserveLitres: input.litres,
      },
      actor,
    );
    const [resources, thresholds] = await Promise.all([
      this.prisma.supplierResources.findUnique({
        where: { supplierId: profile.id },
        select: { fuelReserveLitres: true, confirmedAt: true },
      }),
      this.settings.thresholds(),
    ]);
    return toFuel(resources, now, thresholds.resourcesStaleDays);
  }

  /** Ends this phone's session (the worker app's "Salir"). */
  async signOut(actor: AuthUser): Promise<void> {
    // Without an id the filter would match every session the worker has.
    if (!actor.sessionId) return;
    await this.prisma.session.deleteMany({
      where: { id: actor.sessionId, userId: actor.id },
    });
  }

  /**
   * The worker's jobs (taken, on a booking not cancelled) and open offers
   * whose service touches `from`–`to`. A day either side is read too, since
   * a service's Havana day can differ from its UTC date.
   */
  private async services(
    supplierId: string,
    from: string,
    to: string,
    now: Date,
  ): Promise<{ jobs: WorkerItem[]; offers: WorkerItem[] }> {
    const touches = {
      serviceDateStart: { lt: new Date(dayDate(to).getTime() + 2 * DAY_MS) },
      serviceDateEnd: { gte: new Date(dayDate(from).getTime() - DAY_MS) },
    };
    const [jobs, offers] = await Promise.all([
      this.prisma.serviceItem.findMany({
        where: {
          supplierId,
          status: { in: [...JOB_STATUSES] },
          reservation: { status: { not: ReservationStatus.Cancelled } },
          ...touches,
        },
        orderBy: { serviceDateStart: 'asc' },
        select: ITEM_SELECT,
      }),
      this.prisma.serviceItem.findMany({
        where: {
          supplierId,
          status: ServiceItemStatus.Offered,
          dispatchDeadline: { gt: now },
          ...touches,
        },
        orderBy: { dispatchDeadline: 'asc' },
        select: ITEM_SELECT,
      }),
    ]);
    return { jobs, offers };
  }

  /** An open offer with its answer window, or nothing when it has none. */
  private toOffer(item: WorkerItem, hurryShare: number): WorkerOfferDto[] {
    if (!item.offeredAt || !item.dispatchDeadline) return [];
    const window = item.dispatchDeadline.getTime() - item.offeredAt.getTime();
    return [
      {
        ...this.toJob(item),
        offeredAt: item.offeredAt.toISOString(),
        deadline: item.dispatchDeadline.toISOString(),
        hurryFrom: new Date(item.offeredAt.getTime() + window * hurryShare).toISOString(),
      },
    ];
  }

  private toJob(item: WorkerItem): WorkerJobDto {
    return {
      serviceItemId: item.id,
      serviceType: item.serviceType as ServiceType,
      province: item.province,
      startsAt: item.serviceDateStart.toISOString(),
      endsAt: item.serviceDateEnd.toISOString(),
      bookingCode: item.reservation.bookingCode,
      payout: item.payoutRate.toFixed(2),
      currency: PAYOUT_CURRENCY,
      traveler: {
        firstName: firstName(item.reservation.user.fullName),
        language: item.reservation.user.locale,
        partySize: item.reservation.partySize,
      },
    };
  }
}
