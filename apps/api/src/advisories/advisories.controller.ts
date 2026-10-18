import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  advisoryHistoryQuerySchema,
  advisoryLiftSchema,
  advisoryListQuerySchema,
  advisoryRequestChangesSchema,
  advisoryWriteSchema,
  publicAdvisoryQuerySchema,
  type AdvisoryDto,
  type AdvisoryHistoryQuery,
  type AdvisoryLiftRequest,
  type AdvisoryListItemDto,
  type AdvisoryListQuery,
  type AdvisoryRequestChangesRequest,
  type AdvisoryWriteRequest,
  type PublicAdvisoryDto,
  type PublicAdvisoryQuery,
} from '@ota/schemas';

import { Public } from '../auth/public.decorator';
import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AdvisoriesService } from './advisories.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/**
 * M7 advisories. The public reads (the banner, the package notices and the
 * Current Conditions history) are declared before `:id` so they never reach
 * the desk's routes; drafting, approving, versioning and lifting are writes.
 */
@Controller('advisories')
@UseFilters(DomainExceptionFilter)
export class AdvisoriesController {
  constructor(private readonly advisories: AdvisoriesService) {}

  @Get('active')
  @Public()
  active(
    @Query(new ZodValidationPipe(publicAdvisoryQuerySchema)) query: PublicAdvisoryQuery,
  ): Promise<PublicAdvisoryDto[]> {
    return this.advisories.active(query);
  }

  @Get('history')
  @Public()
  history(
    @Query(new ZodValidationPipe(advisoryHistoryQuerySchema)) query: AdvisoryHistoryQuery,
  ): Promise<PublicAdvisoryDto[]> {
    return this.advisories.history(query);
  }

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(advisoryListQuerySchema)) query: AdvisoryListQuery,
  ): Promise<AdvisoryListItemDto[]> {
    return this.advisories.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  create(
    @Body(new ZodValidationPipe(advisoryWriteSchema)) body: AdvisoryWriteRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryDto> {
    return this.advisories.create(actor, body);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdvisoryDto> {
    return this.advisories.get(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(advisoryWriteSchema)) body: AdvisoryWriteRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryDto> {
    return this.advisories.update(actor, id, body);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryDto> {
    return this.advisories.createVersion(actor, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryDto> {
    return this.advisories.approve(actor, id);
  }

  @Post(':id/request-changes')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  requestChanges(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(advisoryRequestChangesSchema))
    body: AdvisoryRequestChangesRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryDto> {
    return this.advisories.requestChanges(actor, id, body.note);
  }

  @Post(':id/lift')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  lift(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(advisoryLiftSchema)) body: AdvisoryLiftRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryDto> {
    return this.advisories.lift(actor, id, body.note);
  }
}
