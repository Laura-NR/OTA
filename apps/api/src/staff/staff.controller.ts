import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { UserRole } from '@ota/domain';
import {
  acceptInviteSchema,
  changeStaffRoleSchema,
  createInviteSchema,
  type AcceptInviteRequest,
  type ChangeStaffRoleRequest,
  type CreateInviteRequest,
  type StaffInviteDto,
  type StaffUserDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { StaffService } from './staff.service';

/**
 * Users & roles (A-Settings, M9 D4–D5): Super Admin only, except accepting an
 * invitation, which the invited person does once signed in.
 */
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @Roles(UserRole.SuperAdmin)
  list(): Promise<StaffUserDto[]> {
    return this.staff.list();
  }

  @Get('invites')
  @Roles(UserRole.SuperAdmin)
  invites(): Promise<StaffInviteDto[]> {
    return this.staff.invites();
  }

  @Post('invites')
  @Roles(UserRole.SuperAdmin)
  invite(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteRequest,
  ): Promise<StaffInviteDto> {
    return this.staff.invite(actor, body);
  }

  /** Any signed-in person; the service checks the address and the account. */
  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() actor: AuthUser,
    @Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteRequest,
  ): Promise<{ role: string }> {
    return this.staff.accept(actor, body.token);
  }

  @Post('invites/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  confirm(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffInviteDto> {
    return this.staff.confirm(actor, id);
  }

  @Post('invites/:id/resend')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  resend(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffInviteDto> {
    return this.staff.resend(actor, id);
  }

  @Post('invites/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  revoke(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffInviteDto> {
    return this.staff.revoke(actor, id);
  }

  @Patch(':id')
  @Roles(UserRole.SuperAdmin)
  changeRole(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeStaffRoleSchema)) body: ChangeStaffRoleRequest,
  ): Promise<StaffUserDto> {
    return this.staff.changeRole(actor, id, body);
  }

  @Post(':id/revoke-sessions')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  revokeSessions(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffUserDto> {
    return this.staff.revokeSessions(actor, id);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  deactivate(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffUserDto> {
    return this.staff.deactivate(actor, id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.SuperAdmin)
  reactivate(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffUserDto> {
    return this.staff.reactivate(actor, id);
  }
}
