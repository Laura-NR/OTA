import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  acknowledgeAlertSchema,
  deskChannelQuerySchema,
  type AcknowledgeAlertRequest,
  type AlertAcknowledgementDto,
  type DeskAlertMuteStateDto,
  type DeskChannelQuery,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Capability } from '../common/auth/capability.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { DeskAlertsService } from './desk-alerts.service';

/**
 * The desk's alert acknowledgements and its "Mute 15 min" (A-A11y 01). Every
 * operations role sees the mute; acknowledging and muting are for those who
 * re-dispatch.
 */
@Capability('dispatch')
@Controller()
export class DeskAlertsController {
  constructor(private readonly alerts: DeskAlertsService) {}

  @Post('service-items/:id/acknowledge-alert')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acknowledgeAlertSchema)) body: AcknowledgeAlertRequest,
    @Query(new ZodValidationPipe(deskChannelQuerySchema)) query: DeskChannelQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<AlertAcknowledgementDto> {
    return this.alerts.acknowledge(id, body.offeredAt, actor, query.channel);
  }

  @Get('dispatch/alert-mute')
  @Roles(UserRole.OperationsAdmin, UserRole.AdministrativeSupport, UserRole.SuperAdmin)
  mute(): Promise<DeskAlertMuteStateDto> {
    return this.alerts.currentMute();
  }

  @Post('dispatch/alert-mute')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  startMute(
    @Query(new ZodValidationPipe(deskChannelQuerySchema)) query: DeskChannelQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<DeskAlertMuteStateDto> {
    return this.alerts.mute(actor, query.channel);
  }

  @Delete('dispatch/alert-mute')
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  endMute(
    @Query(new ZodValidationPipe(deskChannelQuerySchema)) query: DeskChannelQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<DeskAlertMuteStateDto> {
    return this.alerts.unmute(actor, query.channel);
  }
}
