import { Controller, Get, Param, Query, UseFilters } from '@nestjs/common';
import {
  publicEventQuerySchema,
  type PublicEventDto,
  type PublicEventQuery,
} from '@ota/schemas';

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

  @Get(':slug')
  @Public()
  get(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(publicEventQuerySchema)) query: PublicEventQuery,
  ): Promise<PublicEventDto> {
    return this.events.getPublic(slug, query.locale);
  }
}
