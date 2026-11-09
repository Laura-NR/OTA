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
  /**
   * The session, or null. A bearer token from a session the worker app did
   * not open is refused by the auth package (`BEARER_NOT_ALLOWED`) and reads
   * here as no session, so the route answers 401.
   */
  async getSession(headers: IncomingHttpHeaders): Promise<AuthSession | null> {
    const { auth, toWebHeaders } = requireAuthRuntime();
    try {
      return await auth.api.getSession({ headers: toWebHeaders(headers) });
    } catch (error) {
      if ((error as { body?: { code?: string } }).body?.code === 'BEARER_NOT_ALLOWED') {
        return null;
      }
      throw error;
    }
  }
}
