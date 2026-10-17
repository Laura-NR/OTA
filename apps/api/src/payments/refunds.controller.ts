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
  refundQueueQuerySchema,
  refundSentSchema,
  refundVoteSchema,
  rejectRefundSchema,
  type RefundDto,
  type RefundQueueQuery,
  type RefundSentRequest,
  type RefundVoteRequest,
  type RejectRefundRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PAYMENT_READ_ROLES, PAYMENT_WRITE_ROLES } from './payment-roles';
import { RefundsService } from './refunds.service';

/** The A-Payments refund queue and its approvals (M4 D7). */
@Controller('refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  @Roles(...PAYMENT_READ_ROLES)
  queue(
    @Query(new ZodValidationPipe(refundQueueQuerySchema)) query: RefundQueueQuery,
  ): Promise<RefundDto[]> {
    return this.refunds.queue(query);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(refundVoteSchema)) body: RefundVoteRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<RefundDto> {
    return this.refunds.vote(id, true, body.note, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectRefundSchema)) body: RejectRefundRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<RefundDto> {
    return this.refunds.vote(id, false, body.note, actor);
  }

  @Post(':id/sent')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  sent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(refundSentSchema)) body: RefundSentRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<RefundDto> {
    return this.refunds.markSent(id, body.reference, actor);
  }
}
