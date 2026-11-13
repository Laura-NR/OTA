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
 * The desk's own handling of its alerts (A-A11y 01): a red alert acknowledged,
 * or the cue muted or unmuted, so every open desk follows. A mute concerns no
 * item.
 */
export interface DeskAlertEvent {
  type: 'alert.acknowledged' | 'alert.muted' | 'alert.unmuted';
  serviceItemId: string | null;
  occurredAt: string;
}

/**
 * Broadcasts dispatch/escalation events to the operations desk. The dispatch
 * service depends only on this interface, so tests run without a socket server.
 */
export interface EscalationPublisher {
  publish(event: EscalationEvent | DeskAlertEvent): void;
}

export class NoopEscalationPublisher implements EscalationPublisher {
  publish(): void {
    // no-op
  }
}
