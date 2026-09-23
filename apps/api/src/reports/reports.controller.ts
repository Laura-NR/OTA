import { Controller, Get, Query, Res } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import { analyticsRangeSchema, type AnalyticsRangeQuery } from '@ota/schemas';
import type { Response } from 'express';

import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { XLSX_CONTENT_TYPE } from './reports-digest.service';
import { ReportsService } from './reports.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/** On-demand BI workbook download (spec §4.9.5). */
@Controller('analytics/export')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('xlsx')
  @Roles(...READ_ROLES)
  async export(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeQuery,
    @Res() response: Response,
  ): Promise<void> {
    const { filename, data } = await this.reports.buildDigest(query);
    response.setHeader('content-type', XLSX_CONTENT_TYPE);
    response.setHeader('content-disposition', `attachment; filename="${filename}"`);
    response.send(data);
  }
}
