import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  createMyReservationSchema,
  type CreateMyReservationRequest,
  type MeProfileDto,
  type MyReservationDetailDto,
  type MyReservationListItemDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { MeService } from './me.service';

/**
 * Self-service endpoints for the signed-in user. Any authenticated role may
 * read its own profile and bookings; the service scopes every query by user id.
 */
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentUser() actor: AuthUser): Promise<MeProfileDto> {
    return this.me.getProfile(actor.id);
  }

  @Get('reservations')
  reservations(@CurrentUser() actor: AuthUser): Promise<MyReservationListItemDto[]> {
    return this.me.listReservations(actor.id);
  }

  @Post('reservations')
  @HttpCode(HttpStatus.CREATED)
  createReservation(
    @Body(new ZodValidationPipe(createMyReservationSchema))
    body: CreateMyReservationRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyReservationDetailDto> {
    return this.me.createReservation(actor.id, body);
  }

  @Get('reservations/:id')
  reservation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyReservationDetailDto> {
    return this.me.getReservation(actor.id, id);
  }
}
