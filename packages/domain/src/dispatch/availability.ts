import { zonedCalendarDay } from '../time/ops-calendar';

/**
 * Which calendar days a service covers, read against the supplier's
 * availability calendar (spec §5.2). The calendar stores dates (UTC
 * midnight), and so do bookings' service dates; a service with a clock time
 * is read on its day in Havana.
 */

/** The longest service the check expands day by day; longer ones are cut there. */
export const MAX_SERVICE_DAYS = 62;

const DAY_MS = 24 * 60 * 60 * 1000;

function isUtcMidnight(instant: Date): boolean {
  return instant.getTime() % DAY_MS === 0;
}

/** The calendar day of a service instant, as `YYYY-MM-DD`. */
export function serviceCalendarDay(instant: Date): string {
  const day = isUtcMidnight(instant) ? instant : zonedCalendarDay(instant);
  return day.toISOString().slice(0, 10);
}

/** Every calendar day from the service's start to its end, both included. */
export function serviceCalendarDays(start: Date, end: Date): string[] {
  const first = new Date(`${serviceCalendarDay(start)}T00:00:00Z`).getTime();
  const last = new Date(
    `${serviceCalendarDay(end < start ? start : end)}T00:00:00Z`,
  ).getTime();
  const days: string[] = [];
  for (let day = first; day <= last && days.length < MAX_SERVICE_DAYS; day += DAY_MS) {
    days.push(new Date(day).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Free for the whole service: the supplier is marked available and has
 * blocked none of its days. A day with no calendar entry is available.
 */
export function isFreeForService(
  isAvailable: boolean,
  blockedDays: ReadonlySet<string>,
  serviceDays: readonly string[],
): boolean {
  return isAvailable && serviceDays.every((day) => !blockedDays.has(day));
}
