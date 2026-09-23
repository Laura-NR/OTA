import { Inject, Injectable } from '@nestjs/common';
import type { TenantConfig } from '@ota/config';
import { buildAnalyticsWorkbook } from '@ota/reports';
import type { AnalyticsRangeQuery } from '@ota/schemas';

import { AnalyticsService } from '../analytics/analytics.service';
import { RegulatoryService } from '../regulatory/regulatory.service';
import { TENANT_CONFIG } from '../tenant/tenant.tokens';

export interface DigestFile {
  filename: string;
  data: Buffer;
}

/**
 * Builds the BI digest workbook from the same reads the dashboards use
 * (spec §4.9.5). The workbook layout lives in `packages/reports`.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly regulatory: RegulatoryService,
    @Inject(TENANT_CONFIG) private readonly tenant: TenantConfig,
  ) {}

  async buildDigest(query: AnalyticsRangeQuery): Promise<DigestFile> {
    const [overview, regulatory] = await Promise.all([
      this.analytics.overview(query),
      this.regulatory.summary(query),
    ]);

    const data = await buildAnalyticsWorkbook({
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
    });

    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `ota-bi-digest-${stamp}.xlsx`, data };
  }
}
