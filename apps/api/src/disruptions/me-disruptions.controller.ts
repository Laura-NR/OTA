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
  disruptionTravelerChoiceSchema,
  meDisruptionQuerySchema,
  type DisruptionTravelerChoiceRequest,
  type MeDisruptionDto,
  type MeDisruptionQuery,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { DisruptionsService } from './disruptions.service';

/**
 * The signed-in traveler's disruption offers (M8 D4): any authenticated role,
 * always the caller's own bookings. `:id` is the attached booking's row.
 */
@Controller('me/disruptions')
@UseFilters(DomainExceptionFilter)
export class MeDisruptionsController {
  constructor(private readonly disruptions: DisruptionsService) {}

  @Get()
  mine(
    @Query(new ZodValidationPipe(meDisruptionQuerySchema)) query: MeDisruptionQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<MeDisruptionDto[]> {
    return this.disruptions.mine(actor, query);
  }

  @Post(':id/choice')
  @HttpCode(HttpStatus.OK)
  choose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(disruptionTravelerChoiceSchema))
    body: DisruptionTravelerChoiceRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<MeDisruptionDto> {
    return this.disruptions.choose(actor, id, body.key);
  }
}
