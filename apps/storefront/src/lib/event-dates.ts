import { plainSpaces } from './format';

// Client-safe: the event pages and the request form share it.

/**
 * An event's dates as the Concierge board writes them: the range once the
 * organiser announced it, else the start month with "dates tbc" (M10 D2).
 */
export function eventDateLine(
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
    return `${plainSpaces(month)} · ${tbc}`;
  }
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatRange(new Date(event.startsOn), new Date(event.endsOn)),
  );
}

/** "Mon 18 Jan": one festival night, read in UTC. */
export function nightLabel(date: string, locale: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(date)),
  );
}
