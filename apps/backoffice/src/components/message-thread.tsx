'use client';

import type { MessageDto } from '@ota/schemas';
import { Alert, Button, Input } from '@ota/ui';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { apiRequest } from '@/lib/client-api';
import { connectConversation, type MessageSocketEvent } from '@/lib/socket';

/**
 * Traveler↔operations thread (spec §3.5). Loads history over HTTP, follows the
 * `/conversations` socket for realtime, and posts through the same endpoint the
 * email fallback hangs off.
 */
export function MessageThread({ reservationId }: { reservationId: string }) {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [body, setBody] = useState('');
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  function upsert(message: MessageDto) {
    setMessages((current) =>
      current.some((existing) => existing.id === message.id)
        ? current
        : [...current, message].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  useEffect(() => {
    setMessages([]);
    setError(null);
    apiRequest<MessageDto[]>(`/reservations/${reservationId}/messages`)
      .then(setMessages)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error ? loadError.message : 'Could not load messages',
        ),
      );
  }, [reservationId]);

  useEffect(() => {
    const socket = connectConversation(reservationId);
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('message', (event: MessageSocketEvent) => {
      if (event.reservationId === reservationId) {
        upsert(event.message);
      }
    });
    return () => {
      socket.close();
    };
  }, [reservationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const message = await apiRequest<MessageDto>(
        `/reservations/${reservationId}/messages`,
        { method: 'POST', body: JSON.stringify({ body: trimmed }) },
      );
      upsert(message);
      setBody('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send message');
    } finally {
      setBusy(false);
    }
  }

  async function draftWithAi() {
    setDrafting(true);
    setError(null);
    try {
      const draft = await apiRequest<{ subject: string; body: string }>(
        '/assistant/draft-reply',
        { method: 'POST', body: JSON.stringify({ reservationId }) },
      );
      setBody(draft.body);
    } catch (draftError) {
      setError(
        draftError instanceof Error ? draftError.message : 'Could not draft a reply',
      );
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connected ? 'bg-success' : 'bg-destructive'
          }`}
          aria-hidden
        />
        {connected ? 'live' : 'offline — messages still save and email'}
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'OPERATIONS' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  message.sender === 'OPERATIONS'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-foreground'
                }`}
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p className="mt-1 text-[10px] opacity-70">
                  {message.sender} · {new Date(message.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form className="flex gap-2" onSubmit={send}>
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a reply…"
          aria-label="Message"
        />
        <Button
          type="button"
          variant="outline"
          disabled={drafting || busy}
          onClick={draftWithAi}
        >
          {drafting ? 'Drafting…' : 'Draft with AI'}
        </Button>
        <Button type="submit" disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </div>
  );
}
