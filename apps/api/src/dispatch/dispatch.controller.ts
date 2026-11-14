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
  declineServiceItemSchema,
  deskChannelQuerySchema,
  reassignServiceItemSchema,
  type DeclineServiceItemRequest,
  type DeskChannelQuery,
  type DispatchBoardRowDto,
  type DispatchCandidateDto,
  type DispatchViewDto,
  type ReassignServiceItemRequest,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Capability } from '../common/auth/capability.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe';
import { DispatchService } from './dispatch.service';

@Capability('dispatch')
@Controller()
export class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Post('reservations/:id/dispatch')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<DispatchViewDto> {
    return this.dispatch.startDispatch(id, actor);
  }

  @Get('dispatch/active')
  @Roles(UserRole.OperationsAdmin, UserRole.AdministrativeSupport, UserRole.SuperAdmin)
  active(): Promise<DispatchBoardRowDto[]> {
    return this.dispatch.listActive();
  }

  @Get('reservations/:id/dispatch')
  @Roles(UserRole.OperationsAdmin, UserRole.AdministrativeSupport, UserRole.SuperAdmin)
  view(@Param('id', ParseUUIDPipe) id: string): Promise<DispatchViewDto> {
    return this.dispatch.getView(id);
  }

  @Get('service-items/:id/candidates')
  @Roles(UserRole.OperationsAdmin, UserRole.AdministrativeSupport, UserRole.SuperAdmin)
  candidates(@Param('id', ParseUUIDPipe) id: string): Promise<DispatchCandidateDto[]> {
    return this.dispatch.getCandidates(id);
  }

  @Post('service-items/:id/accept')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ServiceWorker)
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<DispatchViewDto> {
    return this.dispatch.accept(id, actor);
  }

  @Post('service-items/:id/decline')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ServiceWorker)
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineServiceItemSchema))
    body: DeclineServiceItemRequest,
    @CurrentUser() actor: AuthUser,
  ): Promise<DispatchViewDto> {
    return this.dispatch.decline(id, body.reason, actor);
  }

  @Post('service-items/:id/reassign')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OperationsAdmin, UserRole.SuperAdmin)
  reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reassignServiceItemSchema))
    body: ReassignServiceItemRequest,
    @Query(new ZodValidationPipe(deskChannelQuerySchema)) query: DeskChannelQuery,
    @CurrentUser() actor: AuthUser,
  ): Promise<DispatchViewDto> {
    return this.dispatch.reassign(id, body, actor, query.channel);
  }
}
