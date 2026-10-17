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
import { UserRole } from '@ota/domain';
import {
  createProposalVersionSchema,
  proposalQueueQuerySchema,
  type CreateProposalVersionRequest,
  type ProposalDto,
  type ProposalListItemDto,
  type ProposalQueueQuery,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { ProposalsService } from './proposals.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;
const WRITE_ROLES = [UserRole.OperationsAdmin, UserRole.SuperAdmin] as const;

/**
 * M5 on the desk: the custom-request/proposal queue, the request detail and
 * the priced versions. Pricing is a write; reading the queue is an ops read.
 */
@Controller('proposals')
@UseFilters(DomainExceptionFilter)
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(
    @Query(new ZodValidationPipe(proposalQueueQuerySchema)) query: ProposalQueueQuery,
  ): Promise<ProposalListItemDto[]> {
    return this.proposals.listForOps(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProposalDto> {
    return this.proposals.getForOps(id);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...WRITE_ROLES)
  createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createProposalVersionSchema))
    body: CreateProposalVersionRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProposalDto> {
    return this.proposals.createVersion(actor, id, body);
  }
}
