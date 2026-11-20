'use client';

import { messageArrivedLate } from '@ota/domain';
import type { WorkerMessageDto } from '@ota/schemas';
import { Alert, Button, buttonClassName, cn, Icon, Input, Tag } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';

import { opsDayMonth, opsTime } from '@/lib/ops-format';
import { useWorkerThread } from '@/lib/use-worker-thread';

/** "14:10" today, "13 Nov 14:10" before. */
function when(value: string, locale: string, now: Date): string {
  const at = new Date(value);
  return at.toDateString() === now.toDateString()
    ? opsTime(at, locale)
    : `${opsDayMonth(at, locale)} ${opsTime(at, locale)}`;
}

/**
 * A worker's one thread with the desk (`docs/schema-w-messages.md` M6), the
 * same on the supplier page, the booking and Ops Lite: the bubbles (the
 * worker's `neutral-100`, the desk's `primary-100`), the time a message was
 * written and, when it waited on the phone, when it arrived; the desk's
 * read mark; the reply, which from a booking names that booking's service.
 * The support role reads; operations and Super Admin write.
 */
export function WorkerThread({
  supplierId,
  workerName,
  phone,
  subtitle,
  serviceItemId,
  bookingCode,
  canWrite,
  headingId,
  headingRef,
  nameAsHeading = true,
}: {
  supplierId: string;
  workerName: string;
  phone: string;
  /** The line under the name: the worker's job, or their category. */
  subtitle?: string;
  /** The service a reply names, from a booking; null elsewhere. */
  serviceItemId: string | null;
  /** The booking the thread is opened from, whose code needs no tag. */
  bookingCode?: string | null;
  canWrite: boolean;
  headingId: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  /**
   * The name is a heading where nothing else names the worker (Ops Lite, the
   * booking); on the supplier page the `h1` already does, so it is plain text
   * that still labels the thread.
   */
  nameAsHeading?: boolean;
}) {
  const t = useTranslations('backoffice.workerThread');
  const locale = useLocale();
  const { thread, loadError, send } = useWorkerThread(supplierId, t('loadFailed'));
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const firstName = workerName.split(' ')[0] ?? workerName;
  const messages = thread?.messages ?? [];
  const now = new Date();

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  async function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await send(trimmed, serviceItemId);
      setBody('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : t('sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  function meta(message: WorkerMessageDto): string {
    const fromWorker = message.sender === 'WORKER';
    const written = message.writtenAt ?? message.createdAt;
    const parts = [
      t(fromWorker ? 'fromWorker' : 'fromDesk', {
        name: fromWorker ? firstName : (message.authorName ?? t('desk')),
        time: when(written, locale, now),
      }),
    ];
    if (
      fromWorker &&
      messageArrivedLate(
        message.writtenAt ? new Date(message.writtenAt) : null,
        new Date(message.createdAt),
      )
    ) {
      parts.push(t('arrived', { time: when(message.createdAt, locale, now) }));
    }
    if (!fromWorker && message.readAt) {
      parts.push(t('read', { time: when(message.readAt, locale, now) }));
    }
    return parts.join(' · ');
  }

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-2.5 rounded-lg border bg-surface p-3.5"
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-100 text-label font-bold text-warning-700"
        >
          {workerName
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]!.toUpperCase())
            .join('')}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {nameAsHeading ? (
            <h3
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="text-body font-semibold focus:outline-none"
            >
              {workerName}
            </h3>
          ) : (
            <p id={headingId} className="text-body font-semibold">
              {workerName}
            </p>
          )}
          {subtitle ? <p className="text-caption text-muted">{subtitle}</p> : null}
        </div>
        <a
          href={`tel:${phone.replace(/\s/g, '')}`}
          aria-label={t('call', { name: workerName })}
          className={buttonClassName({ variant: 'secondary', size: 'md' })}
        >
          <Icon name="phone" />
          {t('callShort')}
        </a>
      </div>

      {(error ?? loadError) ? (
        <Alert variant="destructive">{error ?? loadError}</Alert>
      ) : null}

      <ol
        ref={listRef}
        aria-label={t('messages')}
        className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto"
      >
        {thread && messages.length === 0 ? (
          <li className="text-body-sm text-muted">{t('empty', { name: firstName })}</li>
        ) : null}
        {messages.map((message) => {
          const ours = message.sender === 'OPERATIONS';
          return (
            <li
              key={message.id}
              className={cn(
                'flex max-w-[85%] flex-col gap-0.5 rounded-md px-3 py-2 text-body-sm',
                ours ? 'self-end bg-primary-100' : 'self-start bg-neutral-100',
              )}
            >
              <span className="whitespace-pre-wrap">{message.body}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-caption text-muted">
                {meta(message)}
                {message.bookingCode && message.bookingCode !== bookingCode ? (
                  <Tag>{message.bookingCode}</Tag>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {canWrite ? (
        <form className="flex gap-2" onSubmit={reply}>
          <Input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t('placeholder', { name: firstName })}
            aria-label={t('reply', { name: firstName })}
            maxLength={2000}
            className="h-12 min-w-0 flex-1"
          />
          <Button
            type="submit"
            size="lg"
            loading={busy}
            aria-label={t('send')}
            className="px-3.5"
          >
            <Icon name="arrow-right" />
          </Button>
        </form>
      ) : (
        <p className="text-caption text-muted">{t('readOnly')}</p>
      )}
      <p className="text-caption text-muted">{t('note')}</p>
    </section>
  );
}
