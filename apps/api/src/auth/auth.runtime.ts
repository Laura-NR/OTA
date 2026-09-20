import type { AuthInstance } from '@ota/auth';
import type { IncomingHttpHeaders } from 'node:http';

export type ToWebHeaders = (headers: IncomingHttpHeaders) => Headers;

interface AuthRuntime {
  auth: AuthInstance;
  toWebHeaders: ToWebHeaders;
}

let runtime: AuthRuntime | undefined;

/**
 * Set the process-wide auth runtime. Called once from bootstrap, before the
 * Nest application is initialised, so the guard can resolve sessions.
 */
export function setAuthRuntime(value: AuthRuntime): void {
  runtime = value;
}

export function requireAuthRuntime(): AuthRuntime {
  if (!runtime) {
    throw new Error('Auth runtime has not been initialised');
  }
  return runtime;
}
