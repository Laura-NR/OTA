import { Injectable } from '@nestjs/common';
import { calculateRegulatory } from '@ota/domain';
import type { RegulatoryRangeQuery, RegulatorySummaryDto } from '@ota/schemas';

import { PrismaService } from '../prisma/prisma.service';

/** Escape a CSV cell; the reports only carry codes, enums, and numbers. */
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Read-only statutory reporting (spec §4.9.2). Raw rows are fetched and reduced
 * by the pure domain helper, so the MINTUR/ecotourism maths stays testable.
 */
@Injectable()
export class RegulatoryService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: RegulatoryRangeQuery): Promise<RegulatorySummaryDto> {
    const createdAtFilter =
      query.from || query.to
        ? {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          }
        : undefined;
    const where = createdAtFilter ? { createdAt: createdAtFilter } : {};

    const reservations = await this.prisma.reservation.findMany({
      where,
      select: {
        userId: true,
        tourismCategory: true,
        user: { select: { nationality: true } },
        serviceItems: {
          select: {
            serviceType: true,
            province: true,
            serviceDateStart: true,
            serviceDateEnd: true,
          },
        },
      },
    });

    const summary = calculateRegulatory(
      reservations.map((reservation) => ({
        userId: reservation.userId,
        tourismCategory: reservation.tourismCategory,
        nationality: reservation.user.nationality,
        serviceItems: reservation.serviceItems,
      })),
    );

    return {
      range: {
        from: query.from ? query.from.toISOString() : null,
        to: query.to ? query.to.toISOString() : null,
      },
      ...summary,
    };
  }

  /**
   * ONAT-oriented ledger export: paid receipts in the window, one row each.
   * This is a data export, not a tax-formatted filing.
   */
  async fiscalExport(query: RegulatoryRangeQuery): Promise<string> {
    const createdAtFilter =
      query.from || query.to
        ? {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {}),
          }
        : undefined;

    const receipts = await this.prisma.paymentReceipt.findMany({
      where: {
        status: 'PAID',
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        createdAt: true,
        rail: true,
        currency: true,
        amount: true,
        reservation: { select: { bookingCode: true } },
      },
    });

    const header = 'booking_code,paid_at,rail,currency,amount';
    const rows = receipts.map((receipt) =>
      [
        csvCell(receipt.reservation.bookingCode),
        csvCell(receipt.createdAt.toISOString()),
        csvCell(receipt.rail),
        csvCell(receipt.currency),
        csvCell(Number(receipt.amount).toFixed(2)),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }
}
