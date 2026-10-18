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
  Put,
  Query,
  UseFilters,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  disruptionAttachSchema,
  disruptionCreateSchema,
  disruptionDeskChoiceSchema,
  disruptionListQuerySchema,
  disruptionOptionsWriteSchema,
  disruptionSafetySchema,
  disruptionSendOptionsSchema,
  disruptionUpdateSchema,
  type AdvisoryDto,
  type DisruptionAlertDto,
  type DisruptionAttachRequest,
  type DisruptionCaseDto,
  type DisruptionCreateRequest,
  type DisruptionDeskChoiceRequest,
  type DisruptionListItemDto,
  type DisruptionListQuery,
  type DisruptionOptionsWriteRequest,
  type DisruptionSafetyRequest,
  type DisruptionSendOptionsRequest,
  type DisruptionUpdateRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { DisruptionsService } from './disruptions.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/**
 * M8 disruption cases (A-Disruption). The desk reads; opening, severity,
 * playbook steps, attaching bookings, the options, the status board and the
 * banner draft are writes. `alerts` is declared before `:id`.
 */
@Controller('disruptions')
@UseFilters(DomainExceptionFilter)
export class DisruptionsController {
  constructor(private readonly disruptions: DisruptionsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(disruptionListQuerySchema)) query: DisruptionListQuery,
  ): Promise<DisruptionListItemDto[]> {
    return this.disruptions.list(query);
  }

  @Get('alerts')
  @Roles(...READ_ROLES)
  alerts(): Promise<DisruptionAlertDto> {
    return this.disruptions.alerts();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  create(
    @Body(new ZodValidationPipe(disruptionCreateSchema)) body: DisruptionCreateRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.create(actor, body);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<DisruptionCaseDto> {
    return this.disruptions.get(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(disruptionUpdateSchema)) body: DisruptionUpdateRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.update(actor, id, body);
  }

  @Post(':id/steps/:stepId/done')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  completeStep(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.completeStep(actor, id, stepId);
  }

  @Post(':id/bookings')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  attach(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(disruptionAttachSchema)) body: DisruptionAttachRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.attach(actor, id, body);
  }

  @Put(':id/options')
  @Roles(...WRITE_ROLES)
  writeOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(disruptionOptionsWriteSchema))
    body: DisruptionOptionsWriteRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.writeOptions(actor, id, body);
  }

  @Post(':id/send-options')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  sendOptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(disruptionSendOptionsSchema))
    body: DisruptionSendOptionsRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.sendOptions(actor, id, body);
  }

  @Post(':id/bookings/:bookingId/safety')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  markSafety(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body(new ZodValidationPipe(disruptionSafetySchema)) body: DisruptionSafetyRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.markSafety(actor, id, bookingId, body);
  }

  @Post(':id/bookings/:bookingId/choice')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  recordChoice(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
    @Body(new ZodValidationPipe(disruptionDeskChoiceSchema))
    body: DisruptionDeskChoiceRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DisruptionCaseDto> {
    return this.disruptions.recordDeskChoice(actor, id, bookingId, body);
  }

  @Post(':id/advisory')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  draftAdvisory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<AdvisoryDto> {
    return this.disruptions.draftAdvisory(actor, id);
  }
}
