import type { MessageDto } from '@ota/schemas';

export const MESSAGE_PUBLISHER = 'ota:message-publisher';

export interface MessageEvent {
  reservationId: string;
  message: MessageDto;
}

/**
 * Broadcasts reservation messages to connected participants. The messaging
 * service depends only on this interface, so tests run without a socket server.
 */
export interface MessagePublisher {
  publish(event: MessageEvent): void;
}

export class NoopMessagePublisher implements MessagePublisher {
  publish(): void {
    // no-op
  }
}
