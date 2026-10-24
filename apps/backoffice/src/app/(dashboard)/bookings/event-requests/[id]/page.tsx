import { UserRole } from '@ota/domain';
import type { EventRequestDetailDto } from '@ota/schemas';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EventRequestActions } from '@/components/event-request-actions';
import { PageHeader } from '@/components/page-header';
import { apiFetch, getServerSession } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { EVENT_REQUEST_BADGE, eventDates } from '@/lib/events';
import { getThresholds } from '@/lib/operating';
import { calendarDate, moneyExact, opsDate, opsTime } from '@/lib/ops-format';

const MANAGE_ROLES: readonly string[] = [UserRole.OperationsAdmin, UserRole.SuperAdmin];

/**
 * One event request (M10 D3–D6): what the traveler asked for, where the
 * tickets go, and the desk's answer. Support reads it; Operations and Super
 * Admins act on it.
 */
export default async function EventRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [t, events, locale, session, thresholds] = await Promise.all([
    getTranslations('eventRequestsDesk'),
    getTranslations('eventsDesk'),
    getLocale(),
    getServerSession(),
    getThresholds(),
  ]);
  const request = await apiFetch<EventRequestDetailDto>(`/event-requests/${id}`).catch(
    (error) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
        return null;
      }
      throw error;
    },
  );
  if (!request) {
    notFound();
  }
  const canManage = session?.user.role ? MANAGE_ROLES.includes(session.user.role) : false;
  const when = (value: string) => `${opsDate(value, locale)} ${opsTime(value, locale)}`;
  const amount = (value: number) => moneyExact(value, request.currency, locale);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/bookings/event-requests" className="text-body-sm text-primary-600">
        {t('back')}
      </Link>
      <PageHeader
        title={request.event.name}
        description={eventDates(request.event, locale, events('datesTbc'))}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-body-sm text-muted">{request.reference}</span>
          <Badge variant={EVENT_REQUEST_BADGE[request.status]}>
            {t(`statuses.${request.status}`)}
          </Badge>
        </div>
      </PageHeader>
      {request.overdue ? (
        <Alert variant="warning">
          {t('overdueAlert', { hours: thresholds.conciergeAnswerHours })}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('request')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-[auto_1fr]">
                <dt className="text-muted">{t('traveler')}</dt>
                <dd className="min-w-0 break-words">
                  <Link
                    href={`/customers/${request.travelerId}`}
                    className="text-primary-600 underline-offset-4 hover:underline"
                  >
                    {request.travelerName ?? request.travelerEmail}
                  </Link>{' '}
                  <span className="text-muted">{request.travelerEmail}</span>
                </dd>
                <dt className="text-muted">{t('seats')}</dt>
                <dd>
                  {t('seatsValue', {
                    seats: request.seats,
                    category: request.categoryName,
                    tickets: request.tickets,
                  })}
                </dd>
                <dt className="text-muted">{t('nights')}</dt>
                <dd>
                  {request.nights.length === 0 ? (
                    t('everyNight')
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {request.nights.map((night) => (
                        <li key={night.date}>
                          {calendarDate(night.date, locale)} · {night.label}
                          {night.venue ? (
                            <span className="text-muted"> · {night.venue}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>
                <dt className="text-muted">{t('trip')}</dt>
                <dd>
                  {t(`paths.${request.path}`)}
                  {request.reservationId && request.bookingCode ? (
                    <>
                      {' · '}
                      <Link
                        href={`/bookings/${request.reservationId}`}
                        className="font-mono text-primary-600 underline-offset-4 hover:underline"
                      >
                        {request.bookingCode}
                      </Link>
                    </>
                  ) : null}
                  {request.customRequestReference ? (
                    <span className="font-mono text-muted">
                      {' · '}
                      {request.customRequestReference}
                    </span>
                  ) : null}
                </dd>
                <dt className="text-muted">{t('confirmBy')}</dt>
                <dd>
                  {request.event.confirmBy
                    ? calendarDate(request.event.confirmBy, locale)
                    : t('noConfirmBy')}
                </dd>
                <dt className="text-muted">{t('received')}</dt>
                <dd>{when(request.createdAt)}</dd>
                {request.notes ? (
                  <>
                    <dt className="text-muted">{t('notes')}</dt>
                    <dd className="min-w-0 whitespace-pre-line break-words">
                      {request.notes}
                    </dd>
                  </>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          {request.status === 'CONFIRMED' && request.total !== null ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('charges')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-6 gap-y-2 text-body-sm sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted">{t('pricePerSeat')}</dt>
                  <dd className="font-mono">{amount(request.pricePerSeat ?? 0)}</dd>
                  <dt className="text-muted">{t('feePerSeat')}</dt>
                  <dd className="font-mono">{amount(request.feePerSeat ?? 0)}</dd>
                  <dt className="text-muted">{t('total')}</dt>
                  <dd className="font-mono font-semibold">{amount(request.total)}</dd>
                  <dt className="text-muted">{t('confirmedAt')}</dt>
                  <dd>{request.confirmedAt ? when(request.confirmedAt) : '—'}</dd>
                </dl>
              </CardContent>
            </Card>
          ) : null}

          {request.closedReason ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('closed')}</CardTitle>
              </CardHeader>
              <CardContent className="text-body-sm">
                <p>{request.closedReason}</p>
                {request.closedAt ? (
                  <p className="mt-1 text-caption text-muted">{when(request.closedAt)}</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('answer')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-body-sm">
              <p className="text-muted">
                {t('feeNote', { fee: amount(request.feePerSeatDefault) })}
              </p>
              {canManage ? (
                <EventRequestActions
                  key={`${request.status}-${request.reservationId ?? ''}`}
                  request={request}
                  locale={locale}
                />
              ) : (
                <p className="text-caption text-muted">{t('readOnly')}</p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
