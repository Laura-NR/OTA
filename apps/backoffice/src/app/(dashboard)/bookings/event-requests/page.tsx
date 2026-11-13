import { EVENT_REQUEST_STATUSES, type EventRequestStatus } from '@ota/domain';
import type { EventRequestListItemDto } from '@ota/schemas';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { apiFetch } from '@/lib/api';
import { EVENT_REQUEST_BADGE, eventDates } from '@/lib/events';
import { getThresholds } from '@/lib/operating';
import { opsDate } from '@/lib/ops-format';

/**
 * Bookings › Event requests (M10 D10): the concierge queue, newest first. A
 * request still unanswered after the threshold is tinted, as the dashboard's
 * other alerts are.
 */
export default async function EventRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; eventId?: string }>;
}) {
  const query = await searchParams;
  const status = EVENT_REQUEST_STATUSES.includes(query.status as EventRequestStatus)
    ? (query.status as EventRequestStatus)
    : undefined;
  const [t, events, locale, thresholds] = await Promise.all([
    getTranslations('eventRequestsDesk'),
    getTranslations('eventsDesk'),
    getLocale(),
    getThresholds(),
  ]);
  const params = new URLSearchParams({ limit: '200' });
  if (status) params.set('status', status);
  if (query.eventId) params.set('eventId', query.eventId);
  const requests = await apiFetch<EventRequestListItemDto[]>(
    `/event-requests?${params.toString()}`,
  ).catch(() => []);

  const filters: (EventRequestStatus | undefined)[] = [
    undefined,
    ...EVENT_REQUEST_STATUSES,
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description', { hours: thresholds.conciergeAnswerHours })}
      />

      <nav aria-label={t('filter')} className="flex flex-wrap gap-2">
        {filters.map((value) => {
          const active = value === status;
          const href = value
            ? `/bookings/event-requests?status=${value}`
            : '/bookings/event-requests';
          return (
            <Link
              key={value ?? 'all'}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-body-sm',
                active
                  ? 'border-primary-600 bg-primary-50 font-semibold text-primary-700'
                  : 'text-secondary hover:text-default',
              )}
            >
              {value ? t(`statuses.${value}`) : t('all')}
            </Link>
          );
        })}
      </nav>

      <Card>
        <CardContent className="pt-6">
          {requests.length === 0 ? (
            <EmptyState title={t('empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('reference')}</TableHead>
                    <TableHead>{t('event')}</TableHead>
                    <TableHead>{t('traveler')}</TableHead>
                    <TableHead>{t('seats')}</TableHead>
                    <TableHead>{t('trip')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead>{t('received')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow
                      key={request.id}
                      tone={request.overdue ? 'attention' : undefined}
                    >
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/bookings/event-requests/${request.id}`}
                          className="font-mono font-medium text-primary-600 underline-offset-4 hover:underline"
                        >
                          {request.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="min-w-[12rem]">
                        <div className="flex flex-col">
                          <span>{request.event.name}</span>
                          <span className="text-caption text-muted">
                            {eventDates(request.event, locale, events('datesTbc'))}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[10rem]">
                        <div className="flex flex-col">
                          <span>{request.travelerName ?? request.travelerEmail}</span>
                          <span className="text-caption text-muted">
                            {request.travelerEmail}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t('seatsValue', {
                          seats: request.seats,
                          category: request.categoryName,
                          tickets: request.tickets,
                        })}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <span>{t(`paths.${request.path}`)}</span>
                          <span className="font-mono text-caption text-muted">
                            {request.bookingCode ?? request.customRequestReference ?? '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={EVENT_REQUEST_BADGE[request.status]}>
                            {t(`statuses.${request.status}`)}
                          </Badge>
                          {request.overdue ? (
                            <span className="text-caption font-medium text-accent-800">
                              {t('overdue', { hours: thresholds.conciergeAnswerHours })}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {opsDate(request.createdAt, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
