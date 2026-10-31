import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import type { DeskSessionDto } from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { DeskSessionService } from './desk-session.service';

const STAFF = [
  UserRole.SuperAdmin,
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
] as const;

/**
 * The desk's idle lock (`docs/schema-m9-idle-lock.md`): the session's lock
 * facts, the desk's input reports and the own-device choice. Staff only; a
 * locked session is refused by the guard before any of these runs.
 */
@Controller('me')
export class DeskSessionController {
  constructor(private readonly sessions: DeskSessionService) {}

  @Get('session')
  @Roles(...STAFF)
  view(@CurrentUser() actor: AuthUser): Promise<DeskSessionDto> {
    return this.sessions.view(actor);
  }

  @Post('activity')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF)
  activity(@CurrentUser() actor: AuthUser): Promise<DeskSessionDto> {
    return this.sessions.activity(actor);
  }

  @Post('session/own-device')
  @HttpCode(HttpStatus.OK)
  @Roles(...STAFF)
  ownDevice(@CurrentUser() actor: AuthUser): Promise<DeskSessionDto> {
    return this.sessions.markOwnDevice(actor);
  }
}
