import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  transitionReservationSchema,
  type ReservationDto,
  type TransitionReservationRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
@UseFilters(DomainExceptionFilter)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

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
