import { OPS_TIME_ZONE } from '@ota/domain';

/**
 * Formatting for the operations desk. Clock times are Havana time (the desk's
 * zone); booking dates are calendar dates stored at UTC midnight, so they are
 * read in UTC to stay on the right day.
 */

/**
 * Node and the browser ship different ICU data, which differ in the spaces
 * they put in dates and ranges (thin, narrow no-break or plain). A client
 * component renders on both, so date text uses plain spaces to hydrate cleanly.
 */
function plainSpaces(text: string): string {
  return text.replace(/[\u00a0\u2009\u202f]/g, ' ');
}

/** The time of day in Havana, 24-hour ("14:32"). */
export function opsTime(value: Date | string, locale: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      timeZone: OPS_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value)),
  );
}

/** The date in Havana with its weekday, in the desk's language. */
export function opsDate(value: Date | string, locale: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      timeZone: OPS_TIME_ZONE,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value)),
  );
}

/** "UTC−4": Havana's offset at `value`. */
export function opsOffset(value: Date): string {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: OPS_TIME_ZONE,
    timeZoneName: 'shortOffset',
  })
    .formatToParts(value)
    .find((candidate) => candidate.type === 'timeZoneName')?.value;
  return (part ?? 'GMT').replace('GMT', 'UTC').replace('-', '−');
}

/** A booking's calendar dates as one range, in the desk's language. */
export function bookingDates(start: string, end: string, locale: string): string {
  return plainSpaces(
    new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).formatRange(new Date(start), new Date(end)),
  );
}

/** "October" (or "Oct" when `short`): a month's name in the desk's language. */
export function monthName(
  year: number,
  month: number,
  locale: string,
  short = false,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: short ? 'short' : 'long',
  }).format(new Date(Date.UTC(year, month - 1, 15)));
}

/** An amount in whole units, the way the desk's figures read ("€41,280" in English). */
export function money(amount: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** 0.23 as a whole percentage in the desk's language ("23%" in English). */
export function percent(fraction: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(fraction);
}

/** A signed whole percentage: 0.18 reads "+18%" in English, -0.12 "-12%". */
export function signedPercent(fraction: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 0,
    signDisplay: 'exceptZero',
  }).format(fraction);
}

/** Whole hours and minutes in a span of milliseconds. */
export function hoursMinutes(ms: number): { hours: number; minutes: number } {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** "0:29": the time left on a timer, hours and minutes. */
export function countdown(ms: number): string {
  const { hours, minutes } = hoursMinutes(ms);
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}
