import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, isOverridable, type PermissionCapability } from '@ota/domain';
import type { IncomingHttpHeaders } from 'node:http';

import type { AuthUser, RequestWithUser } from '../common/auth/auth-user';
import { CAPABILITY_KEY, NOT_OVERRIDABLE_KEY } from '../common/auth/capability.decorator';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { PermissionOverridesService } from '../overrides/permission-overrides.service';
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
 * the user to hold one of those roles, or an active permission override for
 * the route's `@Capability` row where an Operations Admin may act
 * (`docs/schema-m9-permission-overrides.md` O7); the request then carries
 * the override.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly policy: SessionPolicy,
    private readonly overrides: PermissionOverridesService,
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
            idleLockMinutes: refusal.idleLockMinutes,
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
      const override = await this.overrideFor(context, required, user);
      if (!override) {
        throw new ForbiddenException('Insufficient role');
      }
      user.override = override;
    }

    return true;
  }

  /**
   * The person's running override for this route's row (O2, O3, O7): only on
   * a tagged route an Operations Admin may use, never on an approval, and
   * only for a row the person's role may ask for.
   */
  private async overrideFor(
    context: ExecutionContext,
    required: UserRole[],
    user: AuthUser,
  ): Promise<AuthUser['override'] | null> {
    const targets = [context.getHandler(), context.getClass()];
    const capability = this.reflector.getAllAndOverride<PermissionCapability | undefined>(
      CAPABILITY_KEY,
      targets,
    );
    if (
      !capability ||
      !required.includes(UserRole.OperationsAdmin) ||
      this.reflector.getAllAndOverride<boolean>(NOT_OVERRIDABLE_KEY, targets) ||
      !isOverridable(user.role, capability)
    ) {
      return null;
    }
    const active = await this.overrides.activeFor(user.id, capability);
    return active ? { id: active.id, capability } : null;
  }
}
