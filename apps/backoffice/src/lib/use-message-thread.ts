'use client';

import type { MessageDto } from '@ota/schemas';
import { useEffect, useState } from 'react';

import { useDeskLocked } from '@/components/desk-idle-lock';
import { apiRequest } from '@/lib/client-api';
import { connectConversation, type MessageSocketEvent } from '@/lib/socket';

export interface MessageThreadState {
  messages: MessageDto[];
  /** The `/conversations` socket is up. */
  connected: boolean;
  /** The history could not be read. */
  loadError: string | null;
  /** Post a reply; resolves with the stored message, or throws the API's error. */
  send: (body: string) => Promise<MessageDto>;
}

/**
 * One booking's traveler↔operations thread for the desk and Ops Lite: the
 * history over HTTP, then the `/conversations` socket (closed while the desk
 * is idle-locked). Opening the thread marks the traveler's messages read, and
 * so does one arriving while it is open, so AL-Inbox's "New" means unopened.
 */
export function useMessageThread(
  reservationId: string,
  loadFailed: string,
): MessageThreadState {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The idle lock: the feed closes until the desk is unlocked. */
  const locked = useDeskLocked();

  function upsert(message: MessageDto) {
    setMessages((current) =>
      current.some((existing) => existing.id === message.id)
        ? current
        : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  function markRead() {
    // Best effort: an unread count left high is corrected on the next opening.
    void apiRequest(`/reservations/${reservationId}/messages/read`, {
      method: 'POST',
    }).catch(() => undefined);
  }

  useEffect(() => {
    setMessages([]);
    setLoadError(null);
    apiRequest<MessageDto[]>(`/reservations/${reservationId}/messages`)
      .then((list) => {
        setMessages(list);
        if (list.some((message) => message.sender === 'TRAVELER' && !message.readAt)) {
          markRead();
        }
      })
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : loadFailed),
      );
  }, [reservationId]);

  useEffect(() => {
    if (locked) return;
    const socket = connectConversation(reservationId);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('message', (event: MessageSocketEvent) => {
      if (event.reservationId !== reservationId) return;
      upsert(event.message);
      if (event.message.sender === 'TRAVELER') markRead();
    });
    return () => {
      socket.close();
    };
  }, [reservationId, locked]);

  async function send(body: string): Promise<MessageDto> {
    const message = await apiRequest<MessageDto>(
      `/reservations/${reservationId}/messages`,
      { method: 'POST', body: JSON.stringify({ body }) },
    );
    upsert(message);
    return message;
  }

  return { messages, connected, loadError, send };
}
