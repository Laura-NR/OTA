export const ESCALATION_PUBLISHER = 'ota:escalation-publisher';

export type EscalationAlert = 'NONE' | 'AMBER' | 'RED';

export type EscalationEventType =
  'dispatch.offer' | 'dispatch.accept' | 'dispatch.decline' | 'dispatch.timeout';

export interface EscalationEvent {
  type: EscalationEventType;
  alert: EscalationAlert;
  reservationId: string;
  serviceItemId: string;
  supplierId: string | null;
  province: string | null;
  workerPhone: string | null;
  occurredAt: string;
}

/**
 * Broadcasts dispatch/escalation events to the operations desk. The dispatch
 * service depends only on this interface, so tests run without a socket server.
 */
export interface EscalationPublisher {
  publish(event: EscalationEvent): void;
}

export class NoopEscalationPublisher implements EscalationPublisher {
  publish(): void {
    // no-op
  }
}
