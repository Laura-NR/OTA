import { type INestApplication, Logger } from '@nestjs/common';

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** Upper bound on the whole shutdown sequence when SHUTDOWN_TIMEOUT_MS is unset. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

/**
 * Runs Nest's shutdown hooks on SIGTERM/SIGINT (BullMQ workers, Redis clients,
 * the PDF browser and Prisma close in their providers' hooks), then lets Nest
 * re-raise the signal so the process ends with it.
 *
 * Nest awaits every hook with no bound, so one close that never settles (a
 * BullMQ worker waiting on a stuck job, an unreachable Redis) would keep the
 * process alive after SIGTERM. The first signal therefore also arms a timer that
 * force-exits with code 1 once `timeoutMs` has passed.
 */
export function enableGracefulShutdown(app: INestApplication, timeoutMs: number): void {
  const logger = new Logger('Shutdown');
  app.enableShutdownHooks([...SHUTDOWN_SIGNALS]);

  const armTimeout = (signal: NodeJS.Signals): void => {
    // Removed on the first signal, so the signal Nest re-raises at the end of
    // its sequence reaches Node's default handler and terminates the process.
    for (const name of SHUTDOWN_SIGNALS) {
      process.removeListener(name, armTimeout);
    }
    logger.log(`${signal} received; closing (forced exit after ${timeoutMs} ms)`);
    setTimeout(() => {
      logger.error(`Shutdown did not finish within ${timeoutMs} ms; forcing exit`);
      process.exit(1);
    }, timeoutMs);
  };

  for (const name of SHUTDOWN_SIGNALS) {
    process.on(name, armTimeout);
  }
}
