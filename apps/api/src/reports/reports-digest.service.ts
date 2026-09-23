import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Mailer } from '@ota/email';

import { MAILER } from '../email/email.module';
import type { ReportsScheduler } from './reports.scheduler';
import { ReportsService } from './reports.service';
import { REPORTS_SCHEDULER } from './reports.tokens';

export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Recurring weekly BI digest (spec §4.9.5): builds the workbook and emails it
 * to the operations desk. When no recipient is configured the digest is still
 * built and logged, so the pipeline is observable without SMTP.
 */
@Injectable()
export class ReportsDigestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportsDigestService.name);

  constructor(
    private readonly reports: ReportsService,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(REPORTS_SCHEDULER) private readonly scheduler: ReportsScheduler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.schedule(() => this.sendDigest());
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.close();
  }

  async sendDigest(): Promise<void> {
    const to = process.env.ANALYTICS_DIGEST_EMAIL ?? process.env.OPS_NOTIFY_EMAIL;
    const { filename, data } = await this.reports.buildDigest({});

    if (!to) {
      this.logger.log(
        `BI digest built (${filename}, ${data.length} bytes); no recipient configured`,
      );
      return;
    }

    await this.mailer.send({
      to,
      subject: `Weekly BI digest — ${filename}`,
      text: 'Attached is the weekly operations, finance, quality, and regulatory digest.',
      html: '<p>Attached is the weekly operations, finance, quality, and regulatory digest.</p>',
      attachments: [{ filename, content: data, contentType: XLSX_CONTENT_TYPE }],
    });
    this.logger.log(`BI digest emailed to ${to} (${filename})`);
  }
}
