import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  analyticsRangeSchema,
  draftReplyRequestSchema,
  translateRequestSchema,
  type AnalyticsRangeQuery,
  type AssistantSummaryDto,
  type DraftReplyDto,
  type DraftReplyRequest,
  type TranslateRequest,
  type TranslationDto,
} from '@ota/schemas';

import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AssistantService } from './assistant.service';

const OPS_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/** AI assistant for the operations desk (spec §4.8). */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('draft-reply')
  @HttpCode(HttpStatus.OK)
  @Roles(...OPS_ROLES)
  draftReply(
    @Body(new ZodValidationPipe(draftReplyRequestSchema)) body: DraftReplyRequest,
  ): Promise<DraftReplyDto> {
    return this.assistant.draftReply(body.reservationId);
  }

  @Get('ops-summary')
  @Roles(...OPS_ROLES)
  summary(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeQuery,
  ): Promise<AssistantSummaryDto> {
    return this.assistant.summary(query);
  }

  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @Roles(...OPS_ROLES)
  translate(
    @Body(new ZodValidationPipe(translateRequestSchema)) body: TranslateRequest,
  ): Promise<TranslationDto> {
    return this.assistant.translate(body);
  }
}
