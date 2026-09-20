export const DISPATCH_SCHEDULER = 'ota:dispatch-scheduler';

export type DispatchTimeoutHandler = (serviceItemId: string) => Promise<void>;

/**
 * Schedules and cancels per-service-item dispatch timeout jobs. The dispatch
 * service depends only on this interface, so tests run without Redis and the
 * queue implementation can change independently.
 */
export interface DispatchScheduler {
  setTimeoutHandler(handler: DispatchTimeoutHandler): void;
  scheduleTimeout(serviceItemId: string, delayMs: number): Promise<void>;
  cancelTimeout(serviceItemId: string): Promise<void>;
}

/** Used in tests and when no queue backend is configured. */
export class NoopDispatchScheduler implements DispatchScheduler {
  setTimeoutHandler(): void {
    // no-op
  }

  async scheduleTimeout(): Promise<void> {
    // no-op
  }

  async cancelTimeout(): Promise<void> {
    // no-op
  }
}
