import type { Logger } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { Server } from 'socket.io';

import type { AuthService } from './auth.service';
import { sessionMayConnect, type SessionPolicy } from './session-policy';

/** How often a gateway re-checks its sockets' sessions (`docs/schema-m9-idle-lock.md` L5). */
export const SOCKET_RECHECK_MS = 60 * 1000;

/**
 * Drop every socket whose session the guard would now refuse: idle-locked,
 * deactivated or past the staff limit since it connected.
 */
export async function dropRefusedSockets(
  server: Pick<Server, 'fetchSockets'>,
  auth: AuthService,
  policy: SessionPolicy,
  logger: Logger,
): Promise<void> {
  for (const socket of await server.fetchSockets()) {
    const session = await auth
      .getSession(socket.handshake.headers as IncomingHttpHeaders)
      .catch(() => null);
    if (!session || !(await sessionMayConnect(policy, session, logger))) {
      socket.disconnect(true);
    }
  }
}

/** Re-check a gateway's sockets every minute; returns the function that stops it. */
export function startSocketRecheck(
  server: Pick<Server, 'fetchSockets'>,
  auth: AuthService,
  policy: SessionPolicy,
  logger: Logger,
): () => void {
  const timer = setInterval(() => {
    dropRefusedSockets(server, auth, policy, logger).catch((error: unknown) => {
      logger.warn(
        `Socket re-check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }, SOCKET_RECHECK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
