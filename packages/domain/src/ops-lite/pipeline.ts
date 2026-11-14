import { cubaProvinceCode } from '../geography/provinces';
import { ReservationStatus, ServiceType } from '../reservation/status';
import { zonedCalendarDay } from '../time/ops-calendar';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * AL-Pipeline's state list: the spec §4.2 path with ACTION_REQUIRED after the
 * dispatch steps it branches from and CANCELLED last. A draft has not reached
 * the desk's pipeline, so it is not listed.
 */
export const OPS_LITE_STATES = [
  ReservationStatus.ItinerarySubmitted,
  ReservationStatus.DispatchInProgress,
  ReservationStatus.AssemblyAndEscalation,
  ReservationStatus.ActionRequired,
  ReservationStatus.SecuredAndInvoiced,
  ReservationStatus.PendingPayment,
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
  ReservationStatus.Completed,
  ReservationStatus.Cancelled,
] as const;

export type OpsLiteState = (typeof OPS_LITE_STATES)[number];

/** The states AL-Pipeline counts as "in pipeline": submitted and not yet confirmed. */
export const OPS_LITE_OPEN_STATES: readonly OpsLiteState[] = [
  ReservationStatus.ItinerarySubmitted,
  ReservationStatus.DispatchInProgress,
  ReservationStatus.AssemblyAndEscalation,
  ReservationStatus.ActionRequired,
  ReservationStatus.SecuredAndInvoiced,
  ReservationStatus.PendingPayment,
];

/** How a row's clock reads; the screen picks the colour. */
export type PipelineTone = 'default' | 'warning' | 'error' | 'success' | 'info' | 'muted';

/**
 * A row's clock on AL-Pipeline: how long it has waited, how long is left,
 * when the trip starts, which day of it this is, or the day it ended.
 */
export type PipelineClock =
  | { kind: 'waiting'; ms: number; tone: PipelineTone }
  | { kind: 'left'; ms: number; tone: PipelineTone }
  | { kind: 'expired'; tone: PipelineTone }
  | { kind: 'starts'; days: number; tone: PipelineTone }
  | { kind: 'day'; day: number; tone: PipelineTone }
  | { kind: 'date'; date: Date; tone: PipelineTone };

export interface PipelineClockInput {
  status: ReservationStatus;
  createdAt: Date;
  /** The last change to the booking: when it entered its state, near enough. */
  updatedAt: Date;
  /** Calendar dates at UTC midnight, as bookings store them. */
  startDate: Date;
  endDate: Date;
  /** The soonest deadline of an open offer, if any. */
  offerDeadline: Date | null;
  /** The next instalment's due time, if any. */
  dueAt: Date | null;
}

function countdown(deadline: Date | null, now: Date, tone: PipelineTone): PipelineClock {
  if (!deadline) return { kind: 'waiting', ms: 0, tone };
  const left = deadline.getTime() - now.getTime();
  return left > 0 ? { kind: 'left', ms: left, tone } : { kind: 'expired', tone: 'error' };
}

/**
 * The clock a booking shows in its state's list. A request counts from its
 * submission, dispatch down to the soonest offer deadline (amber during
 * assembly), a payment down to its due time, a confirmed trip the days to its
 * start (green on the day), a trip under way its day number, and a finished
 * or cancelled booking its date. ACTION_REQUIRED counts how long the desk has
 * left it, in red.
 */
export function pipelineClock(input: PipelineClockInput, now: Date): PipelineClock {
  const since = (from: Date) => Math.max(0, now.getTime() - from.getTime());
  const today = zonedCalendarDay(now).getTime();
  switch (input.status) {
    case ReservationStatus.DispatchInProgress:
      return countdown(input.offerDeadline, now, 'default');
    case ReservationStatus.AssemblyAndEscalation:
      return countdown(input.offerDeadline, now, 'warning');
    case ReservationStatus.ActionRequired:
      return { kind: 'waiting', ms: since(input.updatedAt), tone: 'error' };
    case ReservationStatus.SecuredAndInvoiced:
      return { kind: 'waiting', ms: since(input.updatedAt), tone: 'default' };
    case ReservationStatus.PendingPayment:
      return input.dueAt
        ? countdown(input.dueAt, now, 'warning')
        : { kind: 'waiting', ms: since(input.updatedAt), tone: 'default' };
    case ReservationStatus.Confirmed: {
      const days = Math.round((input.startDate.getTime() - today) / DAY_MS);
      return { kind: 'starts', days, tone: days <= 0 ? 'success' : 'default' };
    }
    case ReservationStatus.InProgress: {
      const day = Math.floor((today - input.startDate.getTime()) / DAY_MS) + 1;
      return { kind: 'day', day: Math.max(1, day), tone: 'info' };
    }
    case ReservationStatus.Completed:
      return { kind: 'date', date: input.endDate, tone: 'muted' };
    case ReservationStatus.Cancelled:
      return { kind: 'date', date: input.updatedAt, tone: 'muted' };
    default:
      return { kind: 'waiting', ms: since(input.createdAt), tone: 'default' };
  }
}

export interface TripServiceInput {
  serviceType: string;
  province: string | null;
  /** Instants; a stay ends on its check-out day. */
  serviceDateStart: Date;
  serviceDateEnd: Date;
}

/**
 * Where a trip under way is today, by Havana's calendar: the stay that covers
 * the night (where the travelers sleep), else any service that day, else the
 * last service that started before today. Null when no service names a
 * province.
 */
export function provinceToday(
  services: readonly TripServiceInput[],
  now: Date,
): string | null {
  const today = zonedCalendarDay(now).getTime();
  const day = (instant: Date) => zonedCalendarDay(instant).getTime();
  const placed = services.filter((service) => service.province !== null);
  const covering = placed.filter(
    (service) =>
      day(service.serviceDateStart) <= today && day(service.serviceDateEnd) >= today,
  );
  const stay = covering.find(
    (service) =>
      service.serviceType === ServiceType.Accommodation &&
      day(service.serviceDateEnd) > today,
  );
  if (stay) return stay.province;
  if (covering[0]) return covering[0].province;
  const started = placed
    .filter((service) => day(service.serviceDateStart) < today)
    .sort((a, b) => b.serviceDateStart.getTime() - a.serviceDateStart.getTime());
  return started[0]?.province ?? null;
}

export interface GroundBookingInput {
  partySize: number;
  /** The province it is in today (`provinceToday`), a name or a code. */
  province: string | null;
}

export interface GroundCaseInput {
  /** A province code (CU01…); null for a case that is not regional. */
  province: string | null;
  /** The manifest scenario key (outage, hurricane, fuel, casa, flight). */
  scenario: string;
}

export interface GroundProvince {
  /** The province code, or the name as stored when it has none. */
  province: string;
  travelers: number;
  /** The scenario of an open case in the province, if any. */
  scenario: string | null;
}

export interface OnTheGround {
  bookings: number;
  travelers: number;
  /** Most travelers first; travelers with no known province are left out. */
  provinces: GroundProvince[];
}

/**
 * AL-Pipeline's "On the ground now": the trips under way, their travelers,
 * and where they are, each province flagged with an open case's scenario.
 */
export function onTheGround(
  bookings: readonly GroundBookingInput[],
  openCases: readonly GroundCaseInput[],
): OnTheGround {
  const byProvince = new Map<string, number>();
  let travelers = 0;
  for (const booking of bookings) {
    const party = Math.max(1, booking.partySize);
    travelers += party;
    if (booking.province === null) continue;
    const key = cubaProvinceCode(booking.province) ?? booking.province;
    byProvince.set(key, (byProvince.get(key) ?? 0) + party);
  }
  const scenarioOf = (province: string) =>
    openCases.find((openCase) => openCase.province === province)?.scenario ?? null;
  return {
    bookings: bookings.length,
    travelers,
    provinces: [...byProvince.entries()]
      .map(([province, count]) => ({
        province,
        travelers: count,
        scenario: scenarioOf(province),
      }))
      .sort((a, b) => b.travelers - a.travelers || a.province.localeCompare(b.province)),
  };
}

export type MovementKind = 'PAYMENT_DUE' | 'ARRIVAL' | 'DEPARTURE';

export interface MovementInput {
  reservationId: string;
  status: ReservationStatus;
  startDate: Date;
  endDate: Date;
  /** The next instalment's due time, if any. */
  dueAt: Date | null;
}

export interface Movement {
  reservationId: string;
  kind: MovementKind;
  /** The due time; arrivals and departures carry only their date. */
  at: Date | null;
}

const LIVE: readonly ReservationStatus[] = [
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
];

/**
 * AL-Pipeline's "Today's movements", by Havana's calendar: payments falling
 * due today (by time), then confirmed or running trips that start today, then
 * those that end today. Bookings hold no flight or arrival time, so arrivals
 * and departures are by date only.
 */
export function todaysMovements(
  bookings: readonly MovementInput[],
  now: Date,
): Movement[] {
  const today = zonedCalendarDay(now).getTime();
  const dues = bookings
    .filter(
      (booking) =>
        booking.status === ReservationStatus.PendingPayment &&
        booking.dueAt !== null &&
        zonedCalendarDay(booking.dueAt).getTime() === today,
    )
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())
    .map((booking) => ({
      reservationId: booking.reservationId,
      kind: 'PAYMENT_DUE' as const,
      at: booking.dueAt,
    }));
  const live = bookings.filter((booking) => LIVE.includes(booking.status));
  const on = (kind: 'ARRIVAL' | 'DEPARTURE', date: (booking: MovementInput) => Date) =>
    live
      .filter((booking) => date(booking).getTime() === today)
      .map((booking) => ({ reservationId: booking.reservationId, kind, at: null }));
  return [
    ...dues,
    ...on('ARRIVAL', (booking) => booking.startDate),
    ...on('DEPARTURE', (booking) => booking.endDate),
  ];
}
