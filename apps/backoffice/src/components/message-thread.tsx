'use client';

import { editedRatio } from '@ota/domain';
import { Alert, Button, Input } from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { useDeskTelemetry } from '@/components/telemetry/desk-telemetry';
import { apiRequest } from '@/lib/client-api';
import { useMessageThread } from '@/lib/use-message-thread';

/**
 * Traveler↔operations thread (spec §3.5). Loads history over HTTP, follows the
 * `/conversations` socket for realtime (`useMessageThread`, which also marks
 * the traveler's messages read), and posts through the same endpoint the
 * email fallback hangs off. "Draft with AI" shows only while the AI assistant
 * is in force (A4).
 */
export function MessageThread({
  reservationId,
  aiAssistant,
}: {
  reservationId: string;
  aiAssistant: boolean;
}) {
  const t = useTranslations('backoffice.messageThread');
  const why = useTranslations('backoffice.unavailable');
  const {
    messages,
    connected,
    loadError,
    send: post,
  } = useMessageThread(reservationId, t('loadFailed'));
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const track = useDeskTelemetry();
  /** The assistant's last draft, until a message is sent. */
  const draftBody = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => setError(null), [reservationId]);

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
      await post(trimmed);
      if (draftBody.current !== null) {
        track('ai_draft_used', {
          context: 'reply',
          edited_ratio: editedRatio(draftBody.current, trimmed),
        });
        draftBody.current = null;
      }
      setBody('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('sendFailed'));
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
      draftBody.current = draft.body;
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : t('draftFailed'));
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-caption text-muted">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connected ? 'bg-success-600' : 'bg-error-600'
          }`}
          aria-hidden
        />
        {connected ? t('live') : t('offline')}
      </div>

      {(error ?? loadError) ? (
        <Alert variant="destructive">{error ?? loadError}</Alert>
      ) : null}

      <div className="max-h-96 space-y-3 overflow-y-auto rounded-md border p-4">
        {messages.length === 0 ? (
          <p className="text-body-sm text-muted">{t('none')}</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'OPERATIONS' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-body-sm ${
                  message.sender === 'OPERATIONS'
                    ? 'bg-action-primary text-on-primary'
                    : 'bg-sunken text-default'
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
          placeholder={t('placeholder')}
          aria-label={t('message')}
        />
        {aiAssistant ? (
          <Button
            type="button"
            variant="secondary"
            disabled={drafting || busy}
            onClick={draftWithAi}
          >
            {drafting ? t('drafting') : t('draftWithAi')}
          </Button>
        ) : null}
        <Button
          type="submit"
          disabled={busy}
          unavailableReason={
            body.trim() ? undefined : why('fillIn', { field: t('message') })
          }
        >
          {busy ? t('sending') : t('send')}
        </Button>
      </form>
    </div>
  );
}
