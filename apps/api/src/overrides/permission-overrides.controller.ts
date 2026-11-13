import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { STAFF_ROLES, UserRole } from '@ota/domain';
import {
  overrideNoteSchema,
  requestOverrideSchema,
  type MyOverridesDto,
  type OverrideNoteRequest,
  type PermissionOverrideDto,
  type PermissionOverridesDto,
  type RequestOverrideRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { PermissionOverridesService } from './permission-overrides.service';

/**
 * Permission overrides (`docs/schema-m9-permission-overrides.md` O4, O5):
 * any staff member asks and reads their own; Super Admins list and decide;
 * the holder or a Super Admin ends one.
 */
@Controller('permission-overrides')
export class PermissionOverridesController {
  constructor(private readonly overrides: PermissionOverridesService) {}

  @Post()
  @Roles(...STAFF_ROLES)
  request(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(requestOverrideSchema)) body: RequestOverrideRequest,
  ): Promise<PermissionOverrideDto> {
    return this.overrides.request(actor, body);
  }

  @Get('mine')
  @Roles(...STAFF_ROLES)
  mine(@CurrentUser() actor: AuthUser): Promise<MyOverridesDto> {
    return this.overrides.mine(actor);
  }

  @Get()
  @Roles(UserRole.SuperAdmin)
  list(): Promise<PermissionOverridesDto> {
    return this.overrides.list();
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  approve(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(overrideNoteSchema)) body: OverrideNoteRequest,
  ): Promise<PermissionOverrideDto> {
    return this.overrides.approve(actor, id, body);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  decline(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(overrideNoteSchema)) body: OverrideNoteRequest,
  ): Promise<PermissionOverrideDto> {
    return this.overrides.decline(actor, id, body);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF_ROLES)
  end(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(overrideNoteSchema)) body: OverrideNoteRequest,
  ): Promise<PermissionOverrideDto> {
    return this.overrides.end(actor, id, body);
  }
}
