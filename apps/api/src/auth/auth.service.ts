import { Injectable } from '@nestjs/common';
import type { AuthSession } from '@ota/auth';
import type { IncomingHttpHeaders } from 'node:http';

import { requireAuthRuntime } from './auth.runtime';

/**
 * Resolves the current session from request headers. Tests override this
 * provider with a fake so authenticated endpoints can be tested without a
 * database or a real auth backend.
 */
@Injectable()
export class AuthService {
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const { auth, toWebHeaders } = requireAuthRuntime();
    return auth.api.getSession({ headers: toWebHeaders(headers) });
  }
}
