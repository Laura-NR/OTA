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
 * W-Job J6: a worker's on-site emergency reported, or acknowledged by someone
 * on the desk, so every open desk raises or clears its alert.
 */
export interface EmergencyEvent {
  type: 'incident.emergency' | 'incident.acknowledged';
  incidentId: string;
  reservationId: string;
  serviceItemId: string | null;
  occurredAt: string;
}

/**
 * Worker ↔ desk messages M5: a message in a worker's thread, from the worker
 * or someone on the desk, so open inboxes and threads follow. It goes out as
 * its own socket event (`worker-message`), not as an alert.
 */
export interface WorkerMessageEvent {
  type: 'worker.message';
  supplierId: string;
  messageId: string;
  sender: 'WORKER' | 'OPERATIONS';
  serviceItemId: string | null;
  occurredAt: string;
}

/**
 * Broadcasts dispatch/escalation events to the operations desk. The dispatch
 * service depends only on this interface, so tests run without a socket server.
 */
export interface EscalationPublisher {
  publish(
    event: EscalationEvent | DeskAlertEvent | EmergencyEvent | WorkerMessageEvent,
  ): void;
}

export class NoopEscalationPublisher implements EscalationPublisher {
  publish(): void {
    // no-op
  }
}
