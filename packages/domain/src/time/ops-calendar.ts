/**
 * Cuba keeps one time zone, so the desk's clocks, timers and month boundaries
 * are Havana time (A-Dashboard: "timers in Havana time").
 */
export const OPS_TIME_ZONE = 'America/Havana';

/** The zone's offset from UTC at `instant`, in ms (-4 h is -14 400 000). */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  );
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant of the first midnight of a calendar day in `timeZone`. The
 * offset is read twice because the first guess can sit on the other side of a
 * daylight-saving change.
 */
export function zonedMidnight(
  year: number,
  month: number,
  day: number,
  timeZone: string = OPS_TIME_ZONE,
): Date {
  const wallClock = Date.UTC(year, month - 1, day);
  const guess = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
  return new Date(wallClock - zoneOffsetMs(new Date(guess), timeZone));
}

/** The calendar year and month (1–12) of `instant` in `timeZone`. */
export function zonedYearMonth(
  instant: Date,
  timeZone: string = OPS_TIME_ZONE,
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: field('year'), month: field('month') };
}

/**
 * The calendar day of `instant` in `timeZone`, as UTC midnight: the form
 * booking dates are stored in, so the two compare directly.
 */
export function zonedCalendarDay(instant: Date, timeZone: string = OPS_TIME_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(instant);
  const field = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(field('year'), field('month') - 1, field('day')));
}

/**
 * The wall clock of `instant` in `timeZone` as a `datetime-local` value
 * ("2026-10-06T15:00"), so a desk form shows Havana time.
 */
export function zonedWallClock(instant: Date, timeZone: string = OPS_TIME_ZONE): string {
  const local = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
  return local.toISOString().slice(0, 16);
}

/**
 * The instant a `datetime-local` value ("2026-10-06T15:00") names in
 * `timeZone`, or null when it is not one. As in `zonedMidnight`, the offset
 * is read twice across a daylight-saving change.
 */
export function zonedInstant(
  wallClock: string,
  timeZone: string = OPS_TIME_ZONE,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wallClock);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute] = match.map(Number) as number[];
  const asUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const guess = asUtc - zoneOffsetMs(new Date(asUtc), timeZone);
  return new Date(asUtc - zoneOffsetMs(new Date(guess), timeZone));
}

export interface MonthRange {
  year: number;
  month: number;
  /** The month's first instant. */
  from: Date;
  /** The month's last millisecond, so the range works as an inclusive filter. */
  to: Date;
}

/**
 * The calendar month around `now` in `timeZone`, moved by `offset` months
 * (-1 is the month before).
 */
export function monthRange(
  now: Date,
  offset = 0,
  timeZone: string = OPS_TIME_ZONE,
): MonthRange {
  const current = zonedYearMonth(now, timeZone);
  const index = current.year * 12 + (current.month - 1) + offset;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const next = index + 1;
  const from = zonedMidnight(year, month, 1, timeZone);
  const nextStart = zonedMidnight(Math.floor(next / 12), (next % 12) + 1, 1, timeZone);
  return { year, month, from, to: new Date(nextStart.getTime() - 1) };
}
