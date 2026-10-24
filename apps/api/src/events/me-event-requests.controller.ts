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
import {
  createEventRequestSchema,
  type CreateEventRequestRequest,
  type CreateEventRequestResultDto,
  type EventLinkTargetsDto,
  type MyEventRequestDto,
} from '@ota/schemas';
import { z } from 'zod';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { EventRequestsService } from './event-requests.service';

const linkTargetsQuerySchema = z.object({ event: z.string().trim().min(1).max(120) });

/**
 * M10 D4: a signed-in traveler's event requests, always the caller's own (any
 * authenticated role, as the other /me routes).
 */
@Controller('me/event-requests')
@UseFilters(DomainExceptionFilter)
export class MeEventRequestsController {
  constructor(private readonly requests: EventRequestsService) {}

  @Get()
  list(@CurrentUser() actor: AuthUser): Promise<MyEventRequestDto[]> {
    return this.requests.listMine(actor);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body(new ZodValidationPipe(createEventRequestSchema))
    body: CreateEventRequestRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<CreateEventRequestResultDto> {
    return this.requests.create(actor, body);
  }

  @Get('link-targets')
  linkTargets(
    @Query(new ZodValidationPipe(linkTargetsQuerySchema)) query: { event: string },
    @CurrentUser() actor: AuthUser,
  ): Promise<EventLinkTargetsDto> {
    return this.requests.linkTargets(actor, query.event);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyEventRequestDto> {
    return this.requests.cancelMine(actor, id);
  }
}
