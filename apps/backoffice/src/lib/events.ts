import type { EventAccess, EventRequestStatus, EventStatus } from '@ota/domain';
import type { BadgeVariant } from '@ota/ui';

// Client-safe: the event pages and the request queue share it.

/** M10 events on the desk: the badge for each status and access chip. */
export const EVENT_STATUS_BADGE: Record<EventStatus, BadgeVariant> = {
  DRAFT: 'outline',
  PUBLISHED: 'success',
  ARCHIVED: 'secondary',
};

export const EVENT_ACCESS_BADGE: Record<EventAccess, BadgeVariant> = {
  ALLOCATIONS_OPEN: 'success',
  REQUEST_ONLY: 'info',
  PASSES: 'info',
  GUIDE_ONLY: 'secondary',
};

export const EVENT_REQUEST_BADGE: Record<EventRequestStatus, BadgeVariant> = {
  SUBMITTED: 'warning',
  REQUESTING: 'info',
  CONFIRMED: 'success',
  UNAVAILABLE: 'secondary',
  CANCELLED: 'secondary',
};

// ICU spaces differ between Node and the browser; plain spaces hydrate cleanly.
const plain = (value: string) => value.replace(/[\u00a0\u2009\u202f]/g, ' ');

/**
 * An event's dates as the desk and the storefront read them: the range once
 * confirmed, else the start month with the "dates tbc" note (D2).
 */
export function eventDates(
  event: { startsOn: string; endsOn: string; datesConfirmed: boolean },
  locale: string,
  tbc: string,
): string {
  if (!event.datesConfirmed) {
    const month = new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      month: 'short',
      year: 'numeric',
    }).format(new Date(event.startsOn));
    return `${plain(month)} · ${tbc}`;
  }
  return plain(
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatRange(new Date(event.startsOn), new Date(event.endsOn)),
  );
}
