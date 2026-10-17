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
  Res,
} from '@nestjs/common';
import {
  acceptProofSchema,
  proofQueueQuerySchema,
  rejectProofSchema,
  type AcceptProofRequest,
  type ProofQueueItemDto,
  type ProofQueueQuery,
  type RejectProofRequest,
} from '@ota/schemas';
import type { Response } from 'express';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PAYMENT_READ_ROLES, PAYMENT_WRITE_ROLES } from './payment-roles';
import { ProofsService } from './proofs.service';

/** The A-Payments proofs of transfer (M4 D5). */
@Controller('payments/proofs')
export class ProofsController {
  constructor(private readonly proofs: ProofsService) {}

  @Get()
  @Roles(...PAYMENT_READ_ROLES)
  queue(
    @Query(new ZodValidationPipe(proofQueueQuerySchema)) query: ProofQueueQuery,
  ): Promise<ProofQueueItemDto[]> {
    return this.proofs.queue(query);
  }

  /** The file itself; audited, and never cached by the browser. */
  @Get(':id/file')
  @Roles(...PAYMENT_READ_ROLES)
  async file(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Res() response: Response,
  ): Promise<void> {
    const { data, contentType } = await this.proofs.file(id, actor);
    response.setHeader('content-type', contentType);
    response.setHeader('content-disposition', 'inline');
    response.setHeader('cache-control', 'no-store');
    response.send(Buffer.from(data));
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acceptProofSchema)) body: AcceptProofRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProofQueueItemDto> {
    return this.proofs.accept(id, body, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(...PAYMENT_WRITE_ROLES)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectProofSchema)) body: RejectProofRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProofQueueItemDto> {
    return this.proofs.reject(id, body, actor);
  }
}
