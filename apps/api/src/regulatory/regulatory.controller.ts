import { Controller, Get, Header, Query } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  regulatoryRangeSchema,
  type RegulatoryRangeQuery,
  type RegulatorySummaryDto,
} from '@ota/schemas';

import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { RegulatoryService } from './regulatory.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/** Statutory reporting for MINTUR/ONAT (spec §4.9.2). */
@Controller('analytics/regulatory')
export class RegulatoryController {
  constructor(private readonly regulatory: RegulatoryService) {}

  @Get()
  @Roles(...READ_ROLES)
  summary(
    @Query(new ZodValidationPipe(regulatoryRangeSchema)) query: RegulatoryRangeQuery,
  ): Promise<RegulatorySummaryDto> {
    return this.regulatory.summary(query);
  }

  @Get('fiscal-export')
  @Roles(...READ_ROLES)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="fiscal-export.csv"')
  fiscalExport(
    @Query(new ZodValidationPipe(regulatoryRangeSchema)) query: RegulatoryRangeQuery,
  ): Promise<string> {
    return this.regulatory.fiscalExport(query);
  }
}
