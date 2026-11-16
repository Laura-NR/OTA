'use client';

import type { BookingWorkerThreadDto } from '@ota/schemas';
import { Button, buttonClassName, Icon } from '@ota/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { WorkerThread } from '@/components/worker-thread';
import { opsDayMonth, opsTime } from '@/lib/ops-format';

/**
 * A-Booking's "Worker threads" (`docs/schema-w-messages.md` M6): each worker
 * holding one of the booking's services with their latest message about it,
 * a call button, and the whole thread opening in place, where a reply names
 * this booking's service. Worker chats stay apart from the traveler's.
 */
export function BookingWorkerThreads({
  threads,
  bookingCode,
  canWrite,
}: {
  threads: BookingWorkerThreadDto[];
  bookingCode: string;
  canWrite: boolean;
}) {
  const t = useTranslations('backoffice.reservation.workerThreads');
  const locale = useLocale();
  const [open, setOpen] = useState<string | null>(null);

  if (threads.length === 0) {
    return <p className="px-5 text-body-sm text-muted">{t('none')}</p>;
  }

  return (
    <div className="flex flex-col gap-3 px-5">
      <ul className="flex flex-col rounded-lg border">
        {threads.map((thread) => {
          const on = open === thread.supplierId;
          const last = thread.lastMessage;
          return (
            <li
              key={thread.supplierId}
              className="flex flex-wrap items-center gap-3 border-t px-3.5 py-3 first:border-t-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-body font-semibold">{thread.workerName}</strong>
                  <span className="text-caption text-muted">
                    {thread.category.replaceAll('_', ' ')}
                  </span>
                  {thread.unread > 0 ? (
                    <span className="inline-flex h-6 items-center rounded-full bg-info-100 px-2.5 text-caption font-semibold text-info-700">
                      {t('new', { count: thread.unread })}
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-body-sm text-secondary">
                  {last
                    ? last.sender === 'OPERATIONS'
                      ? t('you', { body: last.body })
                      : `“${last.body}”`
                    : t('noMessage')}
                </span>
                {last ? (
                  <span className="text-caption text-muted">
                    {`${opsDayMonth(last.createdAt, locale)} ${opsTime(last.createdAt, locale)}`}
                  </span>
                ) : null}
              </div>
              <a
                href={`tel:${thread.phone.replace(/\s/g, '')}`}
                aria-label={t('call', { name: thread.workerName })}
                className={buttonClassName({ variant: 'secondary', size: 'sm' })}
              >
                <Icon name="phone" />
                {t('callShort')}
              </a>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-expanded={on}
                onClick={() => setOpen(on ? null : thread.supplierId)}
              >
                {on ? t('close') : t('open')}
              </Button>
            </li>
          );
        })}
      </ul>
      {threads
        .filter((thread) => thread.supplierId === open)
        .map((thread) => (
          <WorkerThread
            key={thread.supplierId}
            supplierId={thread.supplierId}
            workerName={thread.workerName}
            phone={thread.phone}
            subtitle={thread.category.replaceAll('_', ' ')}
            serviceItemId={thread.serviceItemIds[0] ?? null}
            bookingCode={bookingCode}
            canWrite={canWrite}
            headingId={`worker-thread-${thread.supplierId}`}
          />
        ))}
    </div>
  );
}
