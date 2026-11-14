'use client';

import { INBOX_FILTERS, matchesInboxFilter, type InboxFilter } from '@ota/domain';
import type { OpsLiteInboxDto, OpsLiteInboxThreadDto } from '@ota/schemas';
import { Alert, Button, buttonClassName, cn, Icon, Input, Tag } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';

import { useDeskLocked } from '@/components/desk-idle-lock';
import { bookingDates, opsDayMonth, opsTime } from '@/lib/ops-format';
import { useMessageThread } from '@/lib/use-message-thread';

/** How often the list is read again. */
const REFRESH_MS = 30_000;

function initials(name: string): string {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

/** "14:10" today, "13 Nov" before. */
function when(value: string, locale: string, now: Date): string {
  const at = new Date(value);
  return at.toDateString() === now.toDateString()
    ? opsTime(at, locale)
    : opsDayMonth(at, locale);
}

function Avatar({ name, urgent }: { name: string; urgent: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-label font-bold',
        urgent ? 'bg-error-100 text-error-700' : 'bg-info-100 text-info-700',
      )}
    >
      {initials(name)}
    </span>
  );
}

/**
 * AL-Inbox: the travelers' threads on a phone, urgent first (a traveler on an
 * open disruption case waiting for a reply), then unread, then the latest.
 * Filters narrow the list; a tapped thread opens below it with a call
 * button, the messages and the reply, which goes in-app with the email copy
 * as on the desk. Opening a thread marks it read. Worker threads do not
 * exist yet.
 */
export function LiteInbox({
  inbox,
  initialThread,
}: {
  inbox: OpsLiteInboxDto;
  initialThread: string | null;
}) {
  const t = useTranslations('backoffice.opsLite.inbox');
  const locale = useLocale();
  const router = useRouter();
  const locked = useDeskLocked();
  const [filter, setFilter] = useState<InboxFilter>('all');
  // Nothing opens by itself: opening marks a thread read, so only a tap (or
  // a link naming the thread) may do it.
  const [selected, setSelected] = useState<string | null>(
    initialThread &&
      inbox.threads.some((thread) => thread.reservationId === initialThread)
      ? initialThread
      : null,
  );
  /** Threads opened here, read before the list is read again. */
  const [opened, setOpened] = useState<ReadonlySet<string>>(
    new Set(selected ? [selected] : []),
  );
  const threadRef = useRef<HTMLHeadingElement>(null);
  const now = new Date();

  useEffect(() => {
    if (locked) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [locked]);

  const unreadOf = (thread: OpsLiteInboxThreadDto) =>
    opened.has(thread.reservationId) ? 0 : thread.unread;
  const input = (thread: OpsLiteInboxThreadDto) => ({
    lastSender: thread.lastMessage.sender,
    lastAt: new Date(thread.lastMessage.createdAt),
    unread: unreadOf(thread),
    openDisruption: thread.disruption !== null,
  });
  const counts: Record<InboxFilter, number> = {
    all: inbox.threads.length,
    urgent: inbox.threads.filter((thread) => thread.urgent).length,
    unread: inbox.threads.filter((thread) => unreadOf(thread) > 0).length,
  };
  const visible = inbox.threads.filter((thread) =>
    matchesInboxFilter(input(thread), filter),
  );
  const current =
    inbox.threads.find((thread) => thread.reservationId === selected) ?? null;

  function open(thread: OpsLiteInboxThreadDto) {
    setSelected(thread.reservationId);
    setOpened((ids) => new Set(ids).add(thread.reservationId));
    // The thread opens below the list; take the reader there.
    requestAnimationFrame(() => threadRef.current?.focus());
  }

  return (
    <div className="flex flex-col gap-3 px-5 pb-6 pt-3.5">
      <div role="group" aria-label={t('filters')} className="flex flex-wrap gap-1.5">
        {INBOX_FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              'inline-flex h-touch items-center gap-1.5 rounded-full border px-3.5 text-body-sm font-medium',
              filter === key
                ? 'border-primary-700 bg-primary-700 text-neutral-0'
                : 'border-input bg-surface text-default',
            )}
          >
            {t(`filter.${key}`)}
            <span className="font-mono text-caption opacity-85">{counts[key]}</span>
          </button>
        ))}
      </div>

      {inbox.threads.length === 0 ? (
        <p className="rounded-lg border bg-surface p-3.5 text-body-sm text-secondary">
          {t('empty')}
        </p>
      ) : (
        <ul
          aria-label={t('threads')}
          className="flex flex-col rounded-lg border bg-surface"
        >
          {visible.length === 0 ? (
            <li className="p-3.5 text-body-sm text-muted">{t('noneHere')}</li>
          ) : null}
          {visible.map((thread) => {
            const name = thread.travelerName || thread.travelerEmail;
            const on = thread.reservationId === selected;
            const unread = unreadOf(thread);
            return (
              <li key={thread.reservationId} className="border-t first:border-t-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => open(thread)}
                  className={cn(
                    'flex w-full gap-3 px-3.5 py-3 text-left focus-visible:-outline-offset-2',
                    on && 'bg-primary-100',
                  )}
                >
                  <Avatar name={name} urgent={thread.urgent} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <strong className="min-w-0 flex-1 truncate text-nav font-semibold">
                        {name}
                      </strong>
                      <span className="text-caption text-muted">
                        {when(thread.lastMessage.createdAt, locale, now)}
                      </span>
                    </span>
                    <span className="truncate text-body-sm text-secondary">
                      {thread.lastMessage.sender === 'OPERATIONS'
                        ? t('you', { body: thread.lastMessage.body })
                        : thread.lastMessage.body}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Tag>{t('kind', { code: thread.bookingCode })}</Tag>
                      {thread.urgent ? (
                        <span className="inline-flex h-6 items-center rounded-full bg-error-100 px-2.5 text-caption font-semibold text-error-700">
                          {t('urgent')}
                        </span>
                      ) : null}
                      {unread > 0 ? (
                        <span className="inline-flex h-6 items-center rounded-full bg-info-100 px-2.5 text-caption font-semibold text-info-700">
                          {t('new', { count: unread })}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {current ? (
        <LiteThread key={current.reservationId} thread={current} headingRef={threadRef} />
      ) : null}
    </div>
  );
}

function LiteThread({
  thread,
  headingRef,
}: {
  thread: OpsLiteInboxThreadDto;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const t = useTranslations('backoffice.opsLite.inbox');
  const threadCopy = useTranslations('backoffice.messageThread');
  const locale = useLocale();
  const { messages, loadError, send } = useMessageThread(
    thread.reservationId,
    threadCopy('loadFailed'),
  );
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const name = thread.travelerName || thread.travelerEmail;
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
      await send(trimmed);
      setBody('');
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : threadCopy('sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="thread-title"
      className="flex flex-col gap-2.5 rounded-lg border bg-surface p-3.5"
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={name} urgent={thread.urgent} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2
            id="thread-title"
            ref={headingRef}
            tabIndex={-1}
            className="text-body font-semibold focus:outline-none"
          >
            {name}
          </h2>
          <p className="text-caption text-muted">
            {[
              thread.bookingCode,
              thread.provinces.join(', '),
              bookingDates(thread.startDate, thread.endDate, locale),
              thread.partySize > 1 ? t('partyOf', { count: thread.partySize }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {thread.travelerPhone ? (
          <a
            href={`tel:${thread.travelerPhone}`}
            aria-label={t('call', { name })}
            className={buttonClassName({ variant: 'secondary', size: 'md' })}
          >
            <Icon name="phone" />
            {t('callShort')}
          </a>
        ) : null}
      </div>

      {(error ?? loadError) ? (
        <Alert variant="destructive">{error ?? loadError}</Alert>
      ) : null}

      <ol
        ref={listRef}
        aria-label={t('messages')}
        className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto"
      >
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
              <span className="text-caption text-muted">
                {t(ours ? 'fromDesk' : 'fromTraveler', {
                  name: name.split(' ')[0] ?? name,
                  time: when(message.createdAt, locale, now),
                })}
              </span>
            </li>
          );
        })}
      </ol>

      <form className="flex gap-2" onSubmit={reply}>
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t('placeholder', { name: name.split(' ')[0] ?? name })}
          aria-label={t('reply')}
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
      <p className="text-caption text-muted">
        {thread.disruption
          ? t('urgentNote', { reference: thread.disruption.reference })
          : t('note')}
      </p>
    </section>
  );
}
