import { Controller, Get, Query } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  analyticsRangeSchema,
  type AnalyticsOverviewDto,
  type AnalyticsRangeQuery,
} from '@ota/schemas';

import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AnalyticsService } from './analytics.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/** Business-intelligence reads for the operations dashboard (spec §4.9). */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @Roles(...READ_ROLES)
  overview(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeQuery,
  ): Promise<AnalyticsOverviewDto> {
    return this.analytics.overview(query);
  }
}
