import { Inject, Injectable } from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import {
  buildAnalyticsHtml,
  buildAnalyticsWorkbook,
  type AnalyticsReportInput,
} from '@ota/reports';
import type { AnalyticsRangeQuery } from '@ota/schemas';

import { AnalyticsService } from '../analytics/analytics.service';
import { DOCUMENT_RENDERER, type DocumentRenderer } from '../documents/document-renderer';
import { RegulatoryService } from '../regulatory/regulatory.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

export interface DigestFile {
  filename: string;
  data: Buffer;
}

/**
 * Builds the BI digest from the same reads the dashboards use (spec §4.9.5):
 * an XLSX workbook and a PDF rendered from the shared HTML layout. The layout
 * lives in `packages/reports`; this service only fetches and renders.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly regulatory: RegulatoryService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
  ) {}

  async buildDigest(query: AnalyticsRangeQuery): Promise<DigestFile> {
    const input = await this.buildInput(query);
    const data = await buildAnalyticsWorkbook(input);
    return { filename: `ota-bi-digest-${stamp(input)}.xlsx`, data };
  }

  async buildPdfDigest(query: AnalyticsRangeQuery): Promise<DigestFile> {
    const input = await this.buildInput(query);
    const pdf = await this.renderer.render(buildAnalyticsHtml(input));
    return { filename: `ota-bi-digest-${stamp(input)}.pdf`, data: Buffer.from(pdf) };
  }

  private async buildInput(query: AnalyticsRangeQuery): Promise<AnalyticsReportInput> {
    const [overview, regulatory] = await Promise.all([
      this.analytics.overview(query),
      this.regulatory.summary(query),
    ]);

    return {
      range: overview.range,
      finance: overview.finance,
      operations: overview.operations,
      quality: overview.quality,
      geography: overview.geography,
      regulatory: {
        bookings: regulatory.bookings,
        travelers: regulatory.travelers,
        bedNights: regulatory.bedNights,
        specialisedRatio: regulatory.specialisedRatio,
        byCategory: regulatory.byCategory,
        nationalities: regulatory.nationalities,
        circuits: regulatory.circuits,
      },
      branding: this.tenant.branding,
      generatedAt: new Date(),
    };
  }
}

function stamp(input: AnalyticsReportInput): string {
  return (input.generatedAt ?? new Date()).toISOString().slice(0, 10);
}
