import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import type {
  MeProfileDto,
  MyReservationDetailDto,
  MyReservationListItemDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
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

  @Get('reservations/:id')
  reservation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<MyReservationDetailDto> {
    return this.me.getReservation(actor.id, id);
  }
}
