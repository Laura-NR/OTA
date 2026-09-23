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
  classifyReservationSchema,
  createReservationSchema,
  listReservationsQuerySchema,
  transitionReservationSchema,
  type AuditLogEntryDto,
  type ClassifyReservationRequest,
  type CreateReservationRequest,
  type ListReservationsQuery,
  type ReservationDetailDto,
  type ReservationDto,
  type ReservationListItemDto,
  type TransitionReservationRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ReservationsService } from './reservations.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

@Controller('reservations')
@UseFilters(DomainExceptionFilter)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(listReservationsQuerySchema))
    query: ListReservationsQuery,
  ): Promise<ReservationListItemDto[]> {
    return this.reservations.list(query);
  }

  @Post()
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  create(
    @Body(new ZodValidationPipe(createReservationSchema))
    body: CreateReservationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ReservationDetailDto> {
    return this.reservations.create(body, actor);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ReservationDetailDto> {
    return this.reservations.getById(id);
  }

  @Get(':id/audit')
  @Roles(...READ_ROLES)
  audit(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogEntryDto[]> {
    return this.reservations.listAudit(id);
  }

  @Patch(':id/tourism-category')
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  classify(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(classifyReservationSchema))
    body: ClassifyReservationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ReservationDto> {
    return this.reservations.classify(id, body, actor);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionReservationSchema))
    body: TransitionReservationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ReservationDto> {
    return this.reservations.transition(id, body, actor);
  }
}
