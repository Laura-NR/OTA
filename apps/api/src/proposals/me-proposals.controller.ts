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
import {
  acceptProposalSchema,
  createCustomRequestSchema,
  declineProposalSchema,
  type AcceptProposalRequest,
  type AcceptProposalResultDto,
  type CreateCustomRequestRequest,
  type CreateCustomRequestResultDto,
  type DeclineProposalRequest,
  type ProposalDto,
  type ProposalListItemDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ProposalsService } from './proposals.service';

/**
 * The traveler's custom-trip flow (M5): send a builder request, read the
 * priced proposal, accept or decline it. Every query is scoped to the caller;
 * acceptance creates a request to book, never a payment.
 */
@Controller('me')
@UseFilters(DomainExceptionFilter)
export class MeProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Post('custom-requests')
  @HttpCode(HttpStatus.CREATED)
  createRequest(
    @Body(new ZodValidationPipe(createCustomRequestSchema))
    body: CreateCustomRequestRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<CreateCustomRequestResultDto> {
    return this.proposals.createRequest(actor, body);
  }

  @Get('proposals')
  list(@CurrentUser() actor: AuthUser): Promise<ProposalListItemDto[]> {
    return this.proposals.listForUser(actor.id);
  }

  @Get('proposals/:id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProposalDto> {
    return this.proposals.getForUser(actor.id, id);
  }

  @Post('proposals/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acceptProposalSchema)) body: AcceptProposalRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<AcceptProposalResultDto> {
    return this.proposals.acceptForUser(actor, id, body.versionId);
  }

  @Post('proposals/:id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineProposalSchema)) body: DeclineProposalRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProposalDto> {
    return this.proposals.declineForUser(actor, id, body);
  }
}
