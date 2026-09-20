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
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from './public.decorator';

interface RequestWithAuth extends RequestWithUser {
  headers: IncomingHttpHeaders;
}

/**
 * Global auth guard. Secure by default: every route requires a valid session
 * unless marked `@Public()`. A route with `@Roles(...)` also requires the user
 * to hold one of those roles.
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
