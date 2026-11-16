'use client';

import {
  INBOX_FILTERS,
  compareInboxThreads,
  matchesInboxFilter,
  type InboxFilter,
  type InboxThreadInput,
} from '@ota/domain';
import type {
  OpsLiteInboxDto,
  OpsLiteInboxThreadDto,
  OpsLiteWorkerThreadDto,
} from '@ota/schemas';
import { Alert, Button, buttonClassName, cn, Icon, Input, Tag } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';

import { useDeskLocked } from '@/components/desk-idle-lock';
import { WorkerThread } from '@/components/worker-thread';
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

function Avatar({
  name,
  urgent,
  worker = false,
}: {
  name: string;
  urgent: boolean;
  /** A worker's thread wears the board's amber avatar. */
  worker?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-label font-bold',
        urgent
          ? 'bg-error-100 text-error-700'
          : worker
            ? 'bg-warning-100 text-warning-700'
            : 'bg-info-100 text-info-700',
      )}
    >
      {initials(name)}
    </span>
  );
}

/** A thread in the one list: a traveler's (one per booking) or a worker's (one per worker). */
type Entry =
  | { kind: 'traveler'; key: string; thread: OpsLiteInboxThreadDto }
  | { kind: 'worker'; key: string; thread: OpsLiteWorkerThreadDto };

/** A worker thread's key, also what `?thread=` names to open one. */
function workerKey(supplierId: string): string {
  return `worker-${supplierId}`;
}

/**
 * AL-Inbox: travelers' and workers' threads in one list on a phone, urgent
 * first (a traveler on an open disruption case, or a worker about today's
 * job, waiting for a reply), then unread, then the latest. Filters narrow
 * the list; a tapped thread opens below it with a call button, the messages
 * and the reply: in-app with the email copy for a traveler, in the worker
 * app for a worker (`docs/schema-w-messages.md` M6). Opening a thread marks
 * it read.
 */
export function LiteInbox({
  inbox,
  initialThread,
  canWriteWorkers,
}: {
  inbox: OpsLiteInboxDto;
  initialThread: string | null;
  /** The support role reads worker threads; operations and Super Admin write. */
  canWriteWorkers: boolean;
}) {
  const t = useTranslations('backoffice.opsLite.inbox');
  const locale = useLocale();
  const router = useRouter();
  const locked = useDeskLocked();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const entries: Entry[] = [
    ...inbox.threads.map<Entry>((thread) => ({
      kind: 'traveler',
      key: thread.reservationId,
      thread,
    })),
    ...inbox.workers.map<Entry>((thread) => ({
      kind: 'worker',
      key: workerKey(thread.supplierId),
      thread,
    })),
  ];
  // Nothing opens by itself: opening marks a thread read, so only a tap (or
  // a link naming the thread) may do it.
  const [selected, setSelected] = useState<string | null>(
    initialThread && entries.some((entry) => entry.key === initialThread)
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

  const unreadOf = (entry: Entry) => (opened.has(entry.key) ? 0 : entry.thread.unread);
  const input = (entry: Entry): InboxThreadInput => ({
    kind: entry.kind,
    lastSender: entry.thread.lastMessage.sender,
    lastAt: new Date(entry.thread.lastMessage.createdAt),
    unread: unreadOf(entry),
    openDisruption: entry.kind === 'traveler' && entry.thread.disruption !== null,
    jobToday: entry.kind === 'worker' && entry.thread.jobToday,
  });
  const ordered = [...entries].sort((a, b) => compareInboxThreads(input(a), input(b)));
  const counts = Object.fromEntries(
    INBOX_FILTERS.map((key) => [
      key,
      entries.filter((entry) => matchesInboxFilter(input(entry), key)).length,
    ]),
  ) as Record<InboxFilter, number>;
  const visible = ordered.filter((entry) => matchesInboxFilter(input(entry), filter));
  const current = entries.find((entry) => entry.key === selected) ?? null;

  function open(entry: Entry) {
    setSelected(entry.key);
    setOpened((keys) => new Set(keys).add(entry.key));
    // The thread opens below the list; take the reader there.
    requestAnimationFrame(() => threadRef.current?.focus());
  }

  /** A worker's line: their kind of work and their current or next job. */
  function workerLine(thread: OpsLiteWorkerThreadDto): string {
    const job = thread.job;
    return [
      t('workerKind', { category: thread.category.replaceAll('_', ' ') }),
      job
        ? t('workerJob', {
            day: opsDayMonth(job.startsAt, locale),
            code: job.bookingCode,
            province: job.province ?? '—',
          })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
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

      {entries.length === 0 ? (
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
          {visible.map((entry) => {
            const name =
              entry.kind === 'worker'
                ? entry.thread.workerName
                : entry.thread.travelerName || entry.thread.travelerEmail;
            const on = entry.key === selected;
            const unread = unreadOf(entry);
            const last = entry.thread.lastMessage;
            return (
              <li key={entry.key} className="border-t first:border-t-0">
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => open(entry)}
                  className={cn(
                    'flex w-full gap-3 px-3.5 py-3 text-left focus-visible:-outline-offset-2',
                    on && 'bg-primary-100',
                  )}
                >
                  <Avatar
                    name={name}
                    urgent={entry.thread.urgent}
                    worker={entry.kind === 'worker'}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <strong className="min-w-0 flex-1 truncate text-nav font-semibold">
                        {name}
                      </strong>
                      <span className="text-caption text-muted">
                        {when(last.createdAt, locale, now)}
                      </span>
                    </span>
                    <span className="truncate text-body-sm text-secondary">
                      {last.sender === 'OPERATIONS'
                        ? t('you', { body: last.body })
                        : last.body}
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      <Tag>
                        {entry.kind === 'worker'
                          ? workerLine(entry.thread)
                          : t('kind', { code: entry.thread.bookingCode })}
                      </Tag>
                      {entry.thread.urgent ? (
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

      {current?.kind === 'traveler' ? (
        <LiteThread key={current.key} thread={current.thread} headingRef={threadRef} />
      ) : current?.kind === 'worker' ? (
        <WorkerThread
          key={current.key}
          supplierId={current.thread.supplierId}
          workerName={current.thread.workerName}
          phone={current.thread.phone}
          subtitle={workerLine(current.thread)}
          serviceItemId={null}
          canWrite={canWriteWorkers}
          headingId="thread-title"
          headingRef={threadRef}
        />
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
