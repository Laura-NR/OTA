export type DigestHandler = () => Promise<void>;

/** Schedules the recurring BI digest job (spec §4.9.5). */
export interface ReportsScheduler {
  schedule(handler: DigestHandler): Promise<void>;
  close(): Promise<void>;
}

/** Used in tests and when Redis is not configured. */
export class NoopReportsScheduler implements ReportsScheduler {
  async schedule(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }
}
