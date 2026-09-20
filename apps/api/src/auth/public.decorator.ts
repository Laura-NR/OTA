import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'ota:public';

/**
 * Mark a handler (or controller) as unauthenticated. Everything else is
 * protected by the global `AuthGuard` by default.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
