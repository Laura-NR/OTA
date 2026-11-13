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
import { OperatingSettingsService } from '../settings/operating-settings.service';
import { AssistantService } from './assistant.service';

const OPS_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/**
 * AI assistant for the operations desk (spec §4.8). Every route is refused
 * while `aiAssistant` is off, or held off in production on the mock (A4).
 */
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly settings: OperatingSettingsService,
  ) {}

  @Post('draft-reply')
  @HttpCode(HttpStatus.OK)
  @Roles(...OPS_ROLES)
  async draftReply(
    @Body(new ZodValidationPipe(draftReplyRequestSchema)) body: DraftReplyRequest,
  ): Promise<DraftReplyDto> {
    await this.settings.requireFeature('aiAssistant');
    return this.assistant.draftReply(body.reservationId);
  }

  @Get('ops-summary')
  @Roles(...OPS_ROLES)
  async summary(
    @Query(new ZodValidationPipe(analyticsRangeSchema)) query: AnalyticsRangeQuery,
  ): Promise<AssistantSummaryDto> {
    await this.settings.requireFeature('aiAssistant');
    return this.assistant.summary(query);
  }

  @Post('translate')
  @HttpCode(HttpStatus.OK)
  @Roles(...OPS_ROLES)
  async translate(
    @Body(new ZodValidationPipe(translateRequestSchema)) body: TranslateRequest,
  ): Promise<TranslationDto> {
    await this.settings.requireFeature('aiAssistant');
    return this.assistant.translate(body);
  }
}
