import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { concatMap, type Observable } from 'rxjs';

import type { RequestWithUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface OverrideRequest extends RequestWithUser {
  method: string;
  route?: { path?: string };
  params?: Record<string, string>;
}

/**
 * O7 of `docs/schema-m9-permission-overrides.md`: a change the guard let
 * through on an override writes `permission.override_used` once it
 * succeeds, naming the override, the route and the record ids in the path.
 * The action's own audit row is unchanged; reads are not recorded.
 */
@Injectable()
export class OverrideAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OverrideAuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<OverrideRequest>();
    const user = request.user;
    if (!user?.override || READS.has(request.method)) {
      return next.handle();
    }
    const { id, capability } = user.override;
    return next.handle().pipe(
      concatMap(async (result: unknown) => {
        try {
          await this.prisma.auditLog.create({
            data: {
              actorUserId: user.id,
              action: 'permission.override_used',
              entityType: 'PermissionOverride',
              entityId: id,
              metadata: {
                capability,
                method: request.method,
                route: request.route?.path ?? null,
                params: request.params ?? {},
              },
            },
          });
        } catch (error) {
          // The action already happened; a missing trace is logged, not undone.
          this.logger.error(
            `Override ${id} use could not be audited: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return result;
      }),
    );
  }
}
