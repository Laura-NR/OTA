import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, isStaffSessionExpired } from '@ota/domain';
import type { IncomingHttpHeaders } from 'node:http';

import type { AuthUser, RequestWithUser } from '../common/auth/auth-user';
import { ROLES_KEY } from '../common/auth/roles.decorator';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

interface RequestWithAuth extends RequestWithUser {
  headers: IncomingHttpHeaders;
}

/** Hours after sign-in when a staff session ends (M9 D9); config, 12 by default. */
function staffSessionHours(): number {
  const value = Number(process.env.STAFF_SESSION_HOURS);
  return Number.isFinite(value) && value > 0 ? value : 12;
}

/**
 * Global auth guard. Secure by default: every route requires a valid session
 * unless marked `@Public()`. A deactivated user is refused, and a staff
 * session ends 12 hours after sign-in (M9 D5, D9); travelers keep Better
 * Auth's session. A route with `@Roles(...)` also requires the user to hold
 * one of those roles.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
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
    if (session.user.deactivatedAt) {
      throw new UnauthorizedException('This account is deactivated');
    }
    const signedInAt = session.session.createdAt;
    if (
      signedInAt &&
      isStaffSessionExpired(
        session.user.role,
        new Date(signedInAt),
        new Date(),
        staffSessionHours(),
      )
    ) {
      throw new UnauthorizedException('The desk session ended; sign in again');
    }

    const user: AuthUser = {
      id: session.user.id,
      email: session.user.email,
      role: (session.user.role ?? UserRole.Traveler) as UserRole,
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
