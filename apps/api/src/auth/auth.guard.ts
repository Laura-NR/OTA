import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@ota/domain';
import type { IncomingHttpHeaders } from 'node:http';

import type { AuthUser, RequestWithUser } from '../common/auth/auth-user';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { ALLOW_WITHOUT_PASSKEY_KEY } from './allow-without-passkey.decorator';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SESSION_LOCKED_CODE, SessionPolicy } from './session-policy';

interface RequestWithAuth extends RequestWithUser {
  headers: IncomingHttpHeaders;
}

/**
 * Global auth guard. Secure by default: every route requires a valid session
 * unless marked `@Public()`. A deactivated user is refused, and a staff
 * session ends 12 hours after sign-in (M9 D5, D9); travelers keep Better
 * Auth's session. An idle-locked staff session is refused with 401
 * `SESSION_LOCKED` (`docs/schema-m9-idle-lock.md`). With the staff passkey rule on, a staff session that did
 * not come from a passkey is refused: 403 `PASSKEY_SETUP_REQUIRED` when the
 * person has none yet, 401 `PASSKEY_SIGN_IN_REQUIRED` otherwise, except on
 * `@AllowWithoutPasskey()` routes. A route with `@Roles(...)` also requires
 * the user to hold one of those roles.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly policy: SessionPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const session = await this.auth.getSession(request.headers);
    if (!session) {
      throw new UnauthorizedException('Authentication required');
    }
    const refusal = await this.policy.refusal(session);
    if (refusal) {
      const allowed =
        (refusal.kind === 'enroll' || refusal.kind === 'use_passkey') &&
        this.reflector.getAllAndOverride<boolean>(ALLOW_WITHOUT_PASSKEY_KEY, [
          context.getHandler(),
          context.getClass(),
        ]);
      if (!allowed) {
        if (refusal.kind === 'enroll') {
          throw new ForbiddenException({
            statusCode: 403,
            code: 'PASSKEY_SETUP_REQUIRED',
            message: refusal.message,
          });
        }
        if (refusal.kind === 'use_passkey') {
          throw new UnauthorizedException({
            statusCode: 401,
            code: 'PASSKEY_SIGN_IN_REQUIRED',
            message: refusal.message,
          });
        }
        if (refusal.kind === 'locked') {
          throw new UnauthorizedException({
            statusCode: 401,
            code: SESSION_LOCKED_CODE,
            message: refusal.message,
          });
        }
        throw new UnauthorizedException(refusal.message);
      }
    }

    const user: AuthUser = {
      id: session.user.id,
      email: session.user.email,
      role: (session.user.role ?? UserRole.Traveler) as UserRole,
      signInMethod: session.session.signInMethod ?? null,
      sessionId: session.session.id,
    };
    request.user = user;

    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    if (!required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
