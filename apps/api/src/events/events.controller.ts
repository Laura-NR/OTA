import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UseFilters,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  eventMediaUpdateSchema,
  eventMediaUploadSchema,
  eventTranslationWriteSchema,
  eventWriteSchema,
  type EventDto,
  type EventListItemDto,
  type EventMediaDto,
  type EventMediaUpdateRequest,
  type EventMediaUploadRequest,
  type EventTranslationWriteRequest,
  type EventWriteRequest,
} from '@ota/schemas';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Capability } from '../common/auth/capability.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { EventsService } from './events.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/** M10 D1: the desk's events (Content › Events). Support reads; writes are ops+super. */
@Capability('catalog')
@Controller('events')
@UseFilters(DomainExceptionFilter)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(): Promise<EventListItemDto[]> {
    return this.events.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  create(
    @Body(new ZodValidationPipe(eventWriteSchema)) body: EventWriteRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventDto> {
    return this.events.create(actor, body);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EventDto> {
    return this.events.get(id);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(eventWriteSchema)) body: EventWriteRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventDto> {
    return this.events.update(actor, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.events.remove(actor, id);
  }

  @Put(':id/translations/:locale')
  @Roles(...WRITE_ROLES)
  putTranslation(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locale') locale: string,
    @Body(new ZodValidationPipe(eventTranslationWriteSchema))
    body: EventTranslationWriteRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventDto> {
    return this.events.putTranslation(actor, id, locale, body);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventDto> {
    return this.events.publish(actor, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventDto> {
    return this.events.archive(actor, id);
  }

  // Event photos are served through an authorised route; the public stream
  // lives at GET /catalog/events/media/:id (docs/schema-m10-holds-photos.md P2).
  @Get('media/:mediaId')
  @Roles(...READ_ROLES)
  async media(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.events.readMedia(mediaId, false);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'private, max-age=60');
    response.send(Buffer.from(data));
  }

  @Post(':id/media')
  @Roles(...WRITE_ROLES)
  addMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(eventMediaUploadSchema)) body: EventMediaUploadRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventMediaDto> {
    return this.events.uploadMedia(actor, id, body);
  }

  @Patch(':id/media/:mediaId')
  @Roles(...WRITE_ROLES)
  updateMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body(new ZodValidationPipe(eventMediaUpdateSchema)) body: EventMediaUpdateRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<EventDto> {
    return this.events.updateMedia(actor, id, mediaId, body);
  }

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  deleteMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.events.deleteMedia(actor, id, mediaId);
  }
}
