import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  addReservationExtraSchema,
  updateReservationPartySchema,
  type AddReservationExtraRequest,
  type ReservationExtraDto,
  type ReservationPartyDto,
  type ReservationPriceLinesDto,
  type TravelerPassportDto,
  type UpdateReservationPartyRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { TravelersService } from './travelers.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/** M2 party, extras, price lines and the passport vault on a booking (ops-only). */
@Controller('reservations/:id')
export class TravelersController {
  constructor(private readonly travelers: TravelersService) {}

  @Get('travelers')
  @Roles(...READ_ROLES)
  getParty(@Param('id', ParseUUIDPipe) id: string): Promise<ReservationPartyDto> {
    return this.travelers.getParty(id);
  }

  @Put('travelers')
  @Roles(...WRITE_ROLES)
  updateParty(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReservationPartySchema))
    body: UpdateReservationPartyRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ReservationPartyDto> {
    return this.travelers.updateParty(id, body, actor);
  }

  /** Decrypt one passport number; audited. Support staff do not see it. */
  @Get('travelers/:travelerId/passport')
  @Roles(...WRITE_ROLES)
  @Header('Cache-Control', 'no-store')
  revealPassport(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('travelerId', ParseUUIDPipe) travelerId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<TravelerPassportDto> {
    return this.travelers.revealPassport(id, travelerId, actor);
  }

  @Post('extras')
  @Roles(...WRITE_ROLES)
  addExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addReservationExtraSchema))
    body: AddReservationExtraRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ReservationExtraDto> {
    return this.travelers.addExtra(id, body, actor);
  }

  @Delete('extras/:extraId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...WRITE_ROLES)
  removeExtra(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('extraId', ParseUUIDPipe) extraId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    return this.travelers.removeExtra(id, extraId, actor);
  }

  @Get('price-lines')
  @Roles(...READ_ROLES)
  getPriceLines(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReservationPriceLinesDto> {
    return this.travelers.getPriceLines(id);
  }
}
