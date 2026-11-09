import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@ota/db';
import {
  RELIABILITY_MIN_ANSWERED,
  ServiceItemStatus,
  calculateSupplierReliability,
  type ServiceType,
  type SupplierCategory,
  type VerificationStatus,
} from '@ota/domain';
import type { WorkerHomeDto, WorkerJobDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';

/** The base currency every payout is kept in. */
const PAYOUT_CURRENCY = 'EUR';

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

function firstName(fullName: string | null): string | null {
  return fullName?.trim().split(/\s+/)[0] || null;
}

function startOfDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The worker app's reads (W-Home, W-Offer), always scoped to the caller's own
 * supplier profile. Travelers appear by first name, language and party size
 * only (W-Login: "Nunca direcciones ni pagos").
 */
@Injectable()
export class WorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
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
      offers: offers.flatMap((item) => {
        if (!item.offeredAt || !item.dispatchDeadline) return [];
        const window = item.dispatchDeadline.getTime() - item.offeredAt.getTime();
        return [
          {
            ...this.toJob(item),
            offeredAt: item.offeredAt.toISOString(),
            deadline: item.dispatchDeadline.toISOString(),
            hurryFrom: new Date(
              item.offeredAt.getTime() + window * hurryShare,
            ).toISOString(),
          },
        ];
      }),
      jobs: jobs.map((item) => this.toJob(item)),
      serverTime: now.toISOString(),
    };
  }

  /** Ends this phone's session (the worker app's "Salir"). */
  async signOut(actor: AuthUser): Promise<void> {
    // Without an id the filter would match every session the worker has.
    if (!actor.sessionId) return;
    await this.prisma.session.deleteMany({
      where: { id: actor.sessionId, userId: actor.id },
    });
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
