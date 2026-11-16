'use client';

import type { DeskWorkerThreadDto, WorkerMessageDto } from '@ota/schemas';
import { useCallback, useEffect, useState } from 'react';

import { useDeskLocked } from '@/components/desk-idle-lock';
import { apiRequest } from '@/lib/client-api';
import { connectEscalation, type WorkerMessageSocketEvent } from '@/lib/socket';

export interface WorkerThreadState {
  thread: DeskWorkerThreadDto | null;
  /** The history could not be read. */
  loadError: string | null;
  /** Post a reply; resolves with the stored message, or throws the API's error. */
  send: (body: string, serviceItemId: string | null) => Promise<WorkerMessageDto>;
}

/**
 * A worker's thread with the desk (`docs/schema-w-messages.md` M6) for the
 * supplier page, the booking and Ops Lite: the history over HTTP, then the
 * `/ops` socket's `worker-message` events (closed while the desk is
 * idle-locked). Opening the thread marks the worker's messages read, and so
 * does one arriving while it is open.
 */
export function useWorkerThread(
  supplierId: string,
  loadFailed: string,
): WorkerThreadState {
  const [thread, setThread] = useState<DeskWorkerThreadDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const locked = useDeskLocked();

  const load = useCallback(() => {
    apiRequest<DeskWorkerThreadDto>(`/suppliers/${supplierId}/messages`)
      .then((fresh) => {
        setThread(fresh);
        setLoadError(null);
        if (
          fresh.messages.some((message) => message.sender === 'WORKER' && !message.readAt)
        ) {
          // Best effort: an unread count left high is corrected on the next opening.
          void apiRequest(`/suppliers/${supplierId}/messages/read`, {
            method: 'POST',
          }).catch(() => undefined);
        }
      })
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : loadFailed),
      );
  }, [supplierId, loadFailed]);

  useEffect(() => {
    setThread(null);
    load();
  }, [load]);

  useEffect(() => {
    if (locked) return;
    const socket = connectEscalation();
    socket.on('worker-message', (event: WorkerMessageSocketEvent) => {
      if (event.supplierId === supplierId) load();
    });
    return () => {
      socket.close();
    };
  }, [supplierId, locked, load]);

  async function send(body: string, serviceItemId: string | null) {
    const message = await apiRequest<WorkerMessageDto>(
      `/suppliers/${supplierId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({ body, serviceItemId }),
      },
    );
    setThread((current) =>
      current && !current.messages.some((existing) => existing.id === message.id)
        ? { ...current, messages: [...current.messages, message] }
        : current,
    );
    return message;
  }

  return { thread, loadError, send };
}
