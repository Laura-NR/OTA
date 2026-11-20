import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseFilters,
} from '@nestjs/common';
import {
  publicEventQuerySchema,
  type PublicEventDto,
  type PublicEventQuery,
} from '@ota/schemas';
import type { Response } from 'express';

import { Public } from '../auth/public.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { EventsService } from './events.service';

/** M10 D2: the storefront's events, published and not yet over, in one locale. */
@Controller('catalog/events')
@UseFilters(DomainExceptionFilter)
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @Public()
  list(
    @Query(new ZodValidationPipe(publicEventQuerySchema)) query: PublicEventQuery,
  ): Promise<PublicEventDto[]> {
    return this.events.listPublic(query.locale);
  }

  // A published event's photo; a draft's or an archived one's is refused (P2).
  @Get('media/:mediaId')
  @Public()
  async media(
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.events.readMedia(mediaId, true);
    response.setHeader('content-type', contentType);
    response.setHeader('cache-control', 'public, max-age=300');
    response.send(Buffer.from(data));
  }

  @Get(':slug')
  @Public()
  get(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(publicEventQuerySchema)) query: PublicEventQuery,
  ): Promise<PublicEventDto> {
    return this.events.getPublic(slug, query.locale);
  }
}
