import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { LlmProvider } from '@ota/ai';
import type {
  AnalyticsRangeQuery,
  AssistantSummaryDto,
  DraftReplyDto,
  TranslateRequest,
  TranslationDto,
} from '@ota/schemas';

import { AnalyticsService } from '../analytics/analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { LLM_PROVIDER } from './assistant.tokens';

/**
 * AI assistant for the operations desk (spec §4.8): drafts contextual replies
 * from a booking's own data, produces a natural-language ops summary from the
 * KPI reduction, and offers translation. The LLM is injected behind
 * `LlmProvider`, so the mock runs until a vendor is selected.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async draftReply(reservationId: string): Promise<DraftReplyDto> {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        user: { select: { fullName: true, locale: true } },
        serviceItems: { orderBy: { serviceDateStart: 'asc' } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!reservation) {
      throw new NotFoundException(`Reservation ${reservationId} not found`);
    }

    return this.llm.draftReply({
      bookingCode: reservation.bookingCode,
      locale: reservation.user.locale ?? 'en',
      status: reservation.status,
      travelerName: reservation.user.fullName,
      serviceSummary: reservation.serviceItems.map((item) =>
        item.province ? `${item.serviceType} (${item.province})` : item.serviceType,
      ),
      latestMessage: reservation.messages[0]?.body ?? null,
    });
  }

  async summary(query: AnalyticsRangeQuery): Promise<AssistantSummaryDto> {
    const overview = await this.analytics.overview(query);
    const bookings = overview.operations.funnel.reduce((sum, row) => sum + row.count, 0);

    return this.llm.summarize({
      range: overview.range,
      bookings,
      paidCount: overview.finance.paidCount,
      gbv: overview.finance.gbv,
      netRevenue: overview.finance.netRevenue,
      acceptanceRate: overview.operations.acceptanceRate,
      topProvinces: overview.geography,
    });
  }

  translate(input: TranslateRequest): Promise<TranslationDto> {
    return this.llm.translate({
      text: input.text,
      targetLocale: input.targetLocale,
    });
  }
}
