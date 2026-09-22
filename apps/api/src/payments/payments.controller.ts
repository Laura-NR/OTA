import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  createPaymentIntentSchema,
  type CreatePaymentIntentRequest,
  type PaymentIntentDto,
  type PaymentReceiptDto,
  type ReservationDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PaymentsService } from './payments.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/** Payment links and confirmation for one reservation (spec §7.1). */
@Controller('reservations/:reservationId/payments')
@UseFilters(DomainExceptionFilter)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<PaymentReceiptDto[]> {
    return this.payments.list(reservationId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  create(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body(new ZodValidationPipe(createPaymentIntentSchema))
    body: CreatePaymentIntentRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<PaymentIntentDto> {
    return this.payments.createIntent(reservationId, body, actor);
  }

  @Post(':paymentId/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(...WRITE_ROLES)
  confirm(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ReservationDto> {
    return this.payments.confirm(reservationId, paymentId, actor);
  }
}
