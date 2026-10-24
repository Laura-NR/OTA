import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseFilters,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  confirmEventRequestSchema,
  eventRequestListQuerySchema,
  eventRequestReasonSchema,
  type ConfirmEventRequestRequest,
  type EventRequestDetailDto,
  type EventRequestListItemDto,
  type EventRequestListQuery,
  type EventRequestReasonRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { EventRequestsService } from './event-requests.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/** M10 D10: the desk's request queue (Bookings › Event requests). */
@Controller('event-requests')
@UseFilters(DomainExceptionFilter)
export class EventRequestsController {
  constructor(private readonly requests: EventRequestsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(eventRequestListQuerySchema))
    query: EventRequestListQuery,
  ): Promise<EventRequestListItemDto[]> {
    return this.requests.list(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EventRequestDetailDto> {
    return this.requests.get(id);
  }

  @Post(':id/requesting')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  requesting(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventRequestDetailDto> {
    return this.requests.markRequesting(actor, id);
  }

  @Post(':id/unavailable')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  unavailable(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(eventRequestReasonSchema))
    body: EventRequestReasonRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventRequestDetailDto> {
    return this.requests.markUnavailable(actor, id, body.reason);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(eventRequestReasonSchema))
    body: EventRequestReasonRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventRequestDetailDto> {
    return this.requests.cancel(actor, id, body.reason);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmEventRequestSchema))
    body: ConfirmEventRequestRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventRequestDetailDto> {
    return this.requests.confirm(actor, id, body);
  }
}
