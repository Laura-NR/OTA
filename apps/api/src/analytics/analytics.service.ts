import { Injectable } from '@nestjs/common';
import {
  calculateFinance,
  calculateGeography,
  calculateOperations,
  calculateQuality,
} from '@ota/domain';
import type { AnalyticsOverviewDto, AnalyticsRangeQuery } from '@ota/schemas';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only KPI aggregation for the operations dashboard (spec §4.9). Raw rows
 * are fetched and reduced by the pure domain helpers, so the maths stays
 * framework-agnostic and unit-tested.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: AnalyticsRangeQuery): Promise<AnalyticsOverviewDto> {
    const createdAtFilter =
      query.from || query.to
        ? {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          }
        : undefined;
    const where = createdAtFilter ? { createdAt: createdAtFilter } : {};

    const [paid, payouts, offers, reservations, reviews, incidents, serviceItems] =
      await Promise.all([
        this.prisma.paymentReceipt.findMany({
          where: { status: 'PAID', ...where },
          select: {
            amount: true,
            rail: true,
            reservation: { select: { packageId: true } },
          },
        }),
        this.prisma.serviceItem.findMany({
          where,
          select: {
            payoutRate: true,
            payoutStatus: true,
            reservation: { select: { packageId: true } },
          },
        }),
        this.prisma.dispatchOffer.findMany({
          where,
          select: { status: true, offeredAt: true, respondedAt: true },
        }),
        this.prisma.reservation.findMany({ where, select: { status: true } }),
        this.prisma.review.findMany({ where, select: { rating: true } }),
        this.prisma.incident.findMany({
          where,
          select: { severity: true, resolvedAt: true },
        }),
        this.prisma.serviceItem.findMany({ where, select: { province: true } }),
      ]);

    const finance = calculateFinance({
      paid: paid.map((payment) => ({
        amount: Number(payment.amount),
        rail: payment.rail,
        packageId: payment.reservation.packageId,
      })),
      payouts: payouts.map((payout) => ({
        payoutRate: Number(payout.payoutRate),
        payoutStatus: payout.payoutStatus,
        packageId: payout.reservation.packageId,
      })),
    });
    const operations = calculateOperations({ offers, reservations });
    const quality = calculateQuality({
      ratings: reviews.map((review) => review.rating),
      incidents: incidents.map((incident) => ({
        severity: incident.severity,
        resolved: incident.resolvedAt !== null,
      })),
    });
    const geography = calculateGeography(serviceItems);

    return {
      range: {
        from: query.from ? query.from.toISOString() : null,
        to: query.to ? query.to.toISOString() : null,
      },
      finance,
      operations,
      quality,
      geography,
    };
  }
}
