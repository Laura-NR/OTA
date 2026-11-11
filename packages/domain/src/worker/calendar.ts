import { serviceCalendarDays } from '../dispatch/availability';
import { zonedCalendarDay } from '../time/ops-calendar';

/**
 * W-Calendar (`docs/worker-app-plan.md` §8): the worker's own availability
 * calendar. Days are `YYYY-MM-DD` strings, the form the availability calendar
 * stores (UTC midnight) and the desk's calendar shows; "today" is Havana's.
 * Pure: the API reads the rows and writes the changes.
 */

export const WORKER_DAY_STATES = ['AVAILABLE', 'BLOCKED', 'JOB', 'OFFER'] as const;
export type WorkerDayState = (typeof WORKER_DAY_STATES)[number];

/**
 * More blocked days in a row than this and the desk marks the worker
 * inactive and calls them before high season (W-Calendar's caption).
 */
export const WORKER_LONG_BLOCK_DAYS = 14;

/** How many months past the current one a worker may see and change. */
export const WORKER_CALENDAR_MONTHS_AHEAD = 12;

/** The most days one "Bloquear varios días" may cover: two months. */
export const WORKER_BLOCK_MAX_DAYS = 62;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * W-Calendar's "Motivo" chips, in the board's order: Familia, Carro en
 * taller, Otro trabajo, Otro (`docs/schema-w-calendar-reasons.md`).
 */
export const WORKER_BLOCK_REASONS = [
  'FAMILY',
  'VEHICLE_REPAIR',
  'OTHER_JOB',
  'OTHER',
] as const;
export type WorkerBlockReason = (typeof WORKER_BLOCK_REASONS)[number];

/**
 * The reason a day set from the app is stored with: none once it is
 * available again, else the reason picked, `OTHER` until the worker picks one
 * (the board's toggle stores "otro"; K2).
 */
export function workerBlockReason(
  isAvailable: boolean,
  picked?: WorkerBlockReason | null,
): WorkerBlockReason | null {
  if (isAvailable) return null;
  return picked ?? 'OTHER';
}

function dayTime(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayString(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** Today in Havana, `YYYY-MM-DD`. */
export function workerToday(now: Date): string {
  return zonedCalendarDay(now).toISOString().slice(0, 10);
}

/** The `YYYY-MM` month `offset` months after `month`. */
export function shiftMonth(month: string, offset: number): string {
  const [year, index] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7);
}

/** Every day of a `YYYY-MM` month. */
export function monthDays(month: string): string[] {
  const first = dayTime(`${month}-01`);
  const next = dayTime(`${shiftMonth(month, 1)}-01`);
  const days: string[] = [];
  for (let time = first; time < next; time += DAY_MS) days.push(dayString(time));
  return days;
}

/** The last day a worker may change: the end of the twelfth month after today's. */
export function workerHorizon(today: string): string {
  const after = shiftMonth(today.slice(0, 7), WORKER_CALENDAR_MONTHS_AHEAD + 1);
  return dayString(dayTime(`${after}-01`) - DAY_MS);
}

/** Every day from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let time = dayTime(from); time <= dayTime(to); time += DAY_MS) {
    days.push(dayString(time));
  }
  return days;
}

/** A service of the worker's on the calendar: a job they took or an offer open to them. */
export interface WorkerCalendarService {
  start: Date;
  end: Date;
}

/**
 * Each day's state, the board's order of precedence: a job, then an open
 * offer, then a block. A day with no calendar entry is available.
 */
export function workerDayStates(
  days: readonly string[],
  blocked: ReadonlySet<string>,
  jobs: readonly WorkerCalendarService[],
  offers: readonly WorkerCalendarService[],
): Map<string, WorkerDayState> {
  const covered = (services: readonly WorkerCalendarService[]) =>
    new Set(
      services.flatMap((service) => serviceCalendarDays(service.start, service.end)),
    );
  const jobDays = covered(jobs);
  const offerDays = covered(offers);
  return new Map(
    days.map((day) => [
      day,
      jobDays.has(day)
        ? 'JOB'
        : offerDays.has(day)
          ? 'OFFER'
          : blocked.has(day)
            ? 'BLOCKED'
            : 'AVAILABLE',
    ]),
  );
}

export type WorkerDaysRefusal = 'BAD_RANGE' | 'PAST' | 'TOO_FAR' | 'TOO_MANY_DAYS';

/**
 * Why a worker may not change `from`–`to`, or null: the range runs
 * backwards, starts before today, ends past the horizon, or is longer than
 * two months.
 */
export function workerDaysRefusal(
  from: string,
  to: string,
  today: string,
): WorkerDaysRefusal | null {
  if (from > to) return 'BAD_RANGE';
  if (from < today) return 'PAST';
  if (to > workerHorizon(today)) return 'TOO_FAR';
  if ((dayTime(to) - dayTime(from)) / DAY_MS + 1 > WORKER_BLOCK_MAX_DAYS) {
    return 'TOO_MANY_DAYS';
  }
  return null;
}

/**
 * Which days of a range the worker's change applies to. Days with a job or an
 * open offer stay as they are: the board sends the worker to the desk for a
 * job and to the offer itself for an offer.
 */
export function planWorkerDays(
  days: readonly string[],
  states: ReadonlyMap<string, WorkerDayState>,
): { change: string[]; kept: string[] } {
  const change: string[] = [];
  const kept: string[] = [];
  for (const day of days) {
    const state = states.get(day);
    (state === 'JOB' || state === 'OFFER' ? kept : change).push(day);
  }
  return { change, kept };
}

/** Consecutive blocked days. */
export interface BlockedRun {
  from: string;
  to: string;
  days: number;
}

/**
 * The first run of blocked days from today on that is longer than
 * `WORKER_LONG_BLOCK_DAYS`, or null. Days before today do not count: the
 * desk calls about the absence still ahead.
 */
export function longBlockedRun(
  blocked: Iterable<string>,
  today: string,
): BlockedRun | null {
  const days = [...new Set(blocked)].filter((day) => day >= today).sort();
  let start = 0;
  for (let index = 1; index <= days.length; index += 1) {
    const continues =
      index < days.length && dayTime(days[index]!) - dayTime(days[index - 1]!) === DAY_MS;
    if (continues) continue;
    const length = index - start;
    if (length > WORKER_LONG_BLOCK_DAYS) {
      return { from: days[start]!, to: days[index - 1]!, days: length };
    }
    start = index;
  }
  return null;
}
