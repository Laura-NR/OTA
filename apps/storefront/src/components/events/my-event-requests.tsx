import { isOpenEventRequest, type EventRequestStatus } from '@ota/domain';
import type { MyEventRequestDto } from '@ota/schemas';
import { Badge, type BadgeVariant } from '@ota/ui';
import { getLocale, getTranslations } from 'next-intl/server';

import { Link } from '@/i18n/navigation';
import { eventDateLine } from '@/lib/event-dates';
import { formatMoney, plainSpaces } from '@/lib/format';

import { CancelEventRequest } from './cancel-event-request';

const VARIANTS: Record<EventRequestStatus, BadgeVariant> = {
  SUBMITTED: 'warning',
  REQUESTING: 'info',
  CONFIRMED: 'success',
  UNAVAILABLE: 'secondary',
  CANCELLED: 'secondary',
};

/**
 * The traveler's event requests (M10 D10, "you see the status in your
 * account"): the event, the seats, the trip they go on and, once confirmed,
 * what they add. Open requests can be withdrawn.
 */
export async function MyEventRequests({
  requests,
  headingLevel = 'h2',
}: {
  requests: readonly MyEventRequestDto[];
  headingLevel?: 'h2' | 'h3';
}) {
  if (requests.length === 0) return null;
  const [t, events, locale] = await Promise.all([
    getTranslations('events.mine'),
    getTranslations('events'),
    getLocale(),
  ]);
  const Heading = headingLevel;

  return (
    <section aria-labelledby="event-requests-title" className="flex flex-col gap-3">
      <Heading id="event-requests-title" className="text-h4 text-default">
        {t('title')}
      </Heading>
      <ul className="flex flex-col gap-2">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-col gap-2 rounded-lg border bg-surface px-4 py-3 text-body-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold">{request.reference}</span>
              <Badge variant={VARIANTS[request.status]}>
                {t(`statuses.${request.status}`)}
              </Badge>
              <Link
                href={`/events/${request.event.slug}`}
                className="font-medium text-primary-600 underline-offset-4 hover:underline"
              >
                {request.event.name}
              </Link>
              <span className="text-muted">
                {eventDateLine(request.event, locale, events('datesTbc'))}
              </span>
            </div>
            <p className="text-secondary">
              {t('seats', {
                seats: request.seats,
                category: request.categoryName,
                tickets: request.tickets,
              })}
              {request.nights.length > 0
                ? ` · ${request.nights.map((night) => night.label).join(', ')}`
                : ''}
              {request.bookingCode
                ? ` · ${t('onBooking', { code: request.bookingCode })}`
                : request.customRequestReference
                  ? ` · ${t('onRequest', { reference: request.customRequestReference })}`
                  : ''}
            </p>
            {request.status === 'CONFIRMED' && request.total !== null ? (
              <p className="font-medium text-default">
                {t('added', {
                  total: plainSpaces(
                    formatMoney(request.total, request.currency, locale),
                  ),
                })}
              </p>
            ) : null}
            {request.closedReason ? (
              <p className="text-muted">{request.closedReason}</p>
            ) : null}
            {isOpenEventRequest(request.status) ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted">{t('nothingCharged')}</span>
                <CancelEventRequest id={request.id} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
