import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '@ota/domain';

export const ROLES_KEY = 'ota:roles';

/**
 * Restrict a handler (or controller) to the given roles. Enforced by
 * `RolesGuard`; an absent `@Roles()` leaves the route open to any authenticated
 * user.
 */
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);
