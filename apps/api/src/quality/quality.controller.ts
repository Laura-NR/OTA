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
  createIncidentSchema,
  listIncidentsQuerySchema,
  listReviewsQuerySchema,
  resolveIncidentSchema,
  type CreateIncidentRequest,
  type IncidentDto,
  type ListIncidentsQuery,
  type ListReviewsQuery,
  type ResolveIncidentRequest,
  type ReviewDto,
  type SupplierReliabilityDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { QualityService } from './quality.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/** Quality, incident, and duty-of-care surface (spec §4.9.4). */
@Controller()
@UseFilters(DomainExceptionFilter)
export class QualityController {
  constructor(private readonly quality: QualityService) {}

  @Get('incidents')
  @Roles(...READ_ROLES)
  listIncidents(
    @Query(new ZodValidationPipe(listIncidentsQuerySchema))
    query: ListIncidentsQuery,
  ): Promise<IncidentDto[]> {
    return this.quality.listIncidents(query);
  }

  @Post('reservations/:id/incidents')
  @Roles(...WRITE_ROLES)
  createIncident(
    @Param('id', ParseUUIDPipe) reservationId: string,
    @Body(new ZodValidationPipe(createIncidentSchema))
    body: CreateIncidentRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<IncidentDto> {
    return this.quality.createIncident(reservationId, body, actor);
  }

  @Patch('incidents/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  resolveIncident(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resolveIncidentSchema))
    body: ResolveIncidentRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<IncidentDto> {
    return this.quality.resolveIncident(id, body, actor);
  }

  @Get('reviews')
  @Roles(...READ_ROLES)
  listReviews(
    @Query(new ZodValidationPipe(listReviewsQuerySchema)) query: ListReviewsQuery,
  ): Promise<ReviewDto[]> {
    return this.quality.listReviews(query);
  }

  @Get('quality/supplier-reliability')
  @Roles(...READ_ROLES)
  supplierReliability(): Promise<SupplierReliabilityDto[]> {
    return this.quality.supplierReliability();
  }
}
