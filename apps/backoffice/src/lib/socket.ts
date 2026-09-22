'use client';

import { io, type Socket } from 'socket.io-client';

export type EscalationAlert = 'NONE' | 'AMBER' | 'RED';

export interface EscalationSocketEvent {
  type: 'dispatch.offer' | 'dispatch.accept' | 'dispatch.decline' | 'dispatch.timeout';
  alert: EscalationAlert;
  reservationId: string;
  serviceItemId: string;
  supplierId: string | null;
  province: string | null;
  workerPhone: string | null;
  occurredAt: string;
}

export interface MessageSocketEvent {
  reservationId: string;
  message: {
    id: string;
    reservationId: string;
    sender: 'TRAVELER' | 'OPERATIONS';
    body: string;
    readAt: string | null;
    createdAt: string;
  };
}

/**
 * Socket.IO lives on the API origin, not the Next origin: the browser connects
 * directly to the API (the realtime gateways set permissive CORS + credentials).
 * The host-only session cookie is shared across ports on localhost.
 */
function apiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (configured) {
    return configured;
  }
  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

export function connectEscalation(): Socket {
  return io(`${apiOrigin()}/ops`, { withCredentials: true });
}

export function connectConversation(reservationId: string): Socket {
  return io(`${apiOrigin()}/conversations`, {
    withCredentials: true,
    query: { reservationId },
  });
}
