'use client';

import type { MessageDto } from '@ota/schemas';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from '@ota/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

/**
 * Traveler ↔ operations thread (spec §3.5) for one booking. History loads over
 * HTTP and replies post through the same endpoint the email fallback hangs off;
 * the socket only feeds the back-office, so the storefront refreshes on send.
 */
export function MessageThread({ reservationId }: { reservationId: string }) {
  const t = useTranslations('account.messages');
  const tSender = useTranslations('account.sender');
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    fetch(`/api/ota/reservations/${reservationId}/messages`, {
      headers: { accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t('loadError'));
        }
        return (await response.json()) as MessageDto[];
      })
      .then((rows) => {
        if (active) setMessages(rows);
      })
      .catch(() => {
        if (active) setError(t('loadError'));
      });
    return () => {
      active = false;
    };
  }, [reservationId, t]);

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
      const response = await fetch(`/api/ota/reservations/${reservationId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (!response.ok) {
        throw new Error(t('sendError'));
      }
      const message = (await response.json()) as MessageDto;
      setMessages((current) => [...current, message]);
      setBody('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('sendError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <Alert variant="destructive">{error}</Alert> : null}

        <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border p-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.sender === 'TRAVELER'
                    ? 'flex justify-end'
                    : 'flex justify-start'
                }
              >
                <div
                  className={
                    message.sender === 'TRAVELER'
                      ? 'max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'max-w-[80%] rounded-lg bg-muted px-3 py-2 text-sm text-foreground'
                  }
                >
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  <p className="mt-1 text-[10px] opacity-70">
                    {tSender(message.sender)} ·{' '}
                    {new Date(message.createdAt).toLocaleString()}
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
            aria-label={t('title')}
          />
          <Button type="submit" disabled={busy || !body.trim()}>
            {busy ? t('sending') : t('send')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
