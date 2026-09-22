export const COMPLIANCE_SCHEDULER = 'ota:compliance-scheduler';

export type ExpiryScanHandler = () => Promise<void>;

/**
 * Schedules the recurring credential-expiry scan. Abstracted so tests run
 * without Redis; the BullMQ implementation is the production default.
 */
export interface ComplianceScheduler {
  schedule(handler: ExpiryScanHandler): Promise<void>;
  close(): Promise<void>;
}

/** Used in tests and when no queue backend is configured. */
export class NoopComplianceScheduler implements ComplianceScheduler {
  async schedule(): Promise<void> {
    // no-op
  }

  async close(): Promise<void> {
    // no-op
  }
}
