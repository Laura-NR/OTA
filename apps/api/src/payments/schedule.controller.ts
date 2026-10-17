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
} from '@nestjs/common';
import {
  createRefundSchema,
  extendInstalmentSchema,
  refundQuoteQuerySchema,
  type CreateRefundRequest,
  type ExtendInstalmentRequest,
  type InstalmentDto,
  type PaymentScheduleDto,
  type RefundDto,
  type RefundQuoteDto,
  type RefundQuoteQuery,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PAYMENT_READ_ROLES, PAYMENT_WRITE_ROLES } from './payment-roles';
import { RefundsService } from './refunds.service';
import { ScheduleService } from './schedule.service';

/** M4 on one booking for the desk: the schedule, more time, and refunds. */
@Controller('reservations/:reservationId')
export class ScheduleController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly refunds: RefundsService,
  ) {}

  @Get('schedule')
  @Roles(...PAYMENT_READ_ROLES)
  get(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
  ): Promise<PaymentScheduleDto> {
    return this.schedule.get(reservationId);
  }

  @Post('instalments/:instalmentId/extend')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  extend(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Param('instalmentId', ParseUUIDPipe) instalmentId: string,
    @Body(new ZodValidationPipe(extendInstalmentSchema)) body: ExtendInstalmentRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<InstalmentDto> {
    return this.schedule.extend(reservationId, instalmentId, body, actor);
  }

  @Get('refunds/quote')
  @Roles(...PAYMENT_READ_ROLES)
  quote(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Query(new ZodValidationPipe(refundQuoteQuerySchema)) query: RefundQuoteQuery,
  ): Promise<RefundQuoteDto> {
    return this.refunds.quote(reservationId, query.receiptId, query.reason);
  }

  @Post('refunds')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...PAYMENT_WRITE_ROLES)
  createRefund(
    @Param('reservationId', ParseUUIDPipe) reservationId: string,
    @Body(new ZodValidationPipe(createRefundSchema)) body: CreateRefundRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<RefundDto> {
    return this.refunds.create(reservationId, body, actor);
  }
}
