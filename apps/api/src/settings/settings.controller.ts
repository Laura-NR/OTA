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
import { UserRole } from '@ota/domain';
import {
  auditLogQuerySchema,
  proposeSettingsSchema,
  type AuditLogQuery,
  type SecurityStatusDto,
  type OperatingSettingsDto,
  type ProposeSettingsRequest,
  type SettingsVersionDto,
  type SystemAuditEntryDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { AuditLogService } from './audit-log.service';
import { OperatingSettingsService } from './operating-settings.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/**
 * A-Settings (M9). The desk reads the thresholds in force; everything else,
 * and every change, is Super Admin only, and a change needs a second one.
 */
@Controller()
export class SettingsController {
  constructor(
    private readonly settings: OperatingSettingsService,
    private readonly audit: AuditLogService,
  ) {}

  @Get('settings/operating')
  @Roles(...READ_ROLES)
  operating(): Promise<OperatingSettingsDto> {
    return this.settings.overview();
  }

  @Get('settings/operating/versions')
  @Roles(UserRole.SuperAdmin)
  versions(): Promise<SettingsVersionDto[]> {
    return this.settings.versions();
  }

  @Post('settings/operating/versions')
  @Roles(UserRole.SuperAdmin)
  propose(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(proposeSettingsSchema)) body: ProposeSettingsRequest,
  ): Promise<SettingsVersionDto> {
    return this.settings.propose(actor, body);
  }

  @Post('settings/operating/versions/:id/apply')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  apply(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OperatingSettingsDto> {
    return this.settings.decide(actor, id, 'APPLY');
  }

  @Post('settings/operating/versions/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  reject(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OperatingSettingsDto> {
    return this.settings.decide(actor, id, 'REJECT');
  }

  @Post('settings/operating/versions/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  withdraw(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OperatingSettingsDto> {
    return this.settings.decide(actor, id, 'WITHDRAW');
  }

  @Get('settings/security')
  @Roles(UserRole.SuperAdmin)
  security(): SecurityStatusDto {
    return this.audit.security();
  }

  @Get('audit-log')
  @Roles(UserRole.SuperAdmin)
  auditLog(
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQuery,
  ): Promise<SystemAuditEntryDto[]> {
    return this.audit.list(query);
  }
}
