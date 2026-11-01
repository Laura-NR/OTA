import { SetMetadata } from '@nestjs/common';
import type { PermissionCapability } from '@ota/domain';

export const CAPABILITY_KEY = 'ota:capability';
export const NOT_OVERRIDABLE_KEY = 'ota:not-overridable';

/**
 * The permission-matrix row a handler (or controller) belongs to
 * (`docs/schema-m9-permission-overrides.md` O7). A role outside `@Roles(...)`
 * passes only with an active override for this row; an untagged route is
 * never overridable.
 */
export const Capability = (
  capability: PermissionCapability,
): MethodDecorator & ClassDecorator => SetMetadata(CAPABILITY_KEY, capability);

/** An approval no override may give (O3): it stays with the roles that hold it. */
export const NotOverridable = (): MethodDecorator & ClassDecorator =>
  SetMetadata(NOT_OVERRIDABLE_KEY, true);
