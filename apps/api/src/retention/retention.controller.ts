import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  listRetentionQuerySchema,
  type ListRetentionQuery,
  type RetentionPendingUserDto,
  type RetentionScanResultDto,
} from '@ota/schemas';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { RetentionService } from './retention.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/**
 * GDPR retention lifecycle (spec §3.5): the public keep-alive link carried by
 * the notice email, an operations view of pending records, and a manual scan
 * trigger (the daily worker calls the same service).
 */
@Controller()
@UseFilters(DomainExceptionFilter)
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get('retention/keep-alive')
  @Public()
  async keepAlive(
    @Query('token') token: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.retention.confirmKeepAlive(token ?? '');
    res.status(result.status).type('html').send(result.html);
  }

  @Get('retention/pending')
  @Roles(...READ_ROLES)
  listPending(
    @Query(new ZodValidationPipe(listRetentionQuerySchema))
    query: ListRetentionQuery,
  ): Promise<RetentionPendingUserDto[]> {
    return this.retention.listPending(query);
  }

  @Post('retention/scan')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  scan(): Promise<RetentionScanResultDto> {
    return this.retention.scan();
  }
}
