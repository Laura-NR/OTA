import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics/analytics.module';
import { DocumentsModule } from '../documents/documents.module';
import { RegulatoryModule } from '../regulatory/regulatory.module';
import { BullmqReportsScheduler } from './bullmq-reports.scheduler';
import { ReportsDigestService } from './reports-digest.service';
import { ReportsController } from './reports.controller';
import { NoopReportsScheduler } from './reports.scheduler';
import { ReportsService } from './reports.service';
import { REPORTS_SCHEDULER } from './reports.tokens';

/**
 * BI exports: an on-demand XLSX download and the weekly emailed digest. The
 * scheduler is a no-op in tests or when Redis is not configured.
 */
@Module({
  imports: [AnalyticsModule, RegulatoryModule, DocumentsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsDigestService,
    {
      provide: REPORTS_SCHEDULER,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL;
        if (process.env.NODE_ENV === 'test' || !redisUrl) {
          return new NoopReportsScheduler();
        }
        return new BullmqReportsScheduler(redisUrl);
      },
    },
  ],
})
export class ReportsModule {}
