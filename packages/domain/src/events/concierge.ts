import { zonedCalendarDay } from '../time/ops-calendar';

/**
 * M10 events and the ticket concierge (`docs/schema-m10-events.md`). The API
 * stores events and requests; these rules decide what a request may ask for,
 * how it moves, when the desk is late to answer, the trip a request derives
 * for the M5 desk, and what confirmed seats cost.
 */

export const EVENT_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EVENT_ACCESS = [
  'ALLOCATIONS_OPEN',
  'REQUEST_ONLY',
  'PASSES',
  'GUIDE_ONLY',
] as const;
export type EventAccess = (typeof EVENT_ACCESS)[number];

export const SEAT_CATEGORY_KINDS = ['GENERAL', 'NUMBERED', 'PASS'] as const;
export type SeatCategoryKind = (typeof SEAT_CATEGORY_KINDS)[number];

export const EVENT_REQUEST_STATUSES = [
  'SUBMITTED',
  'REQUESTING',
  'CONFIRMED',
  'UNAVAILABLE',
  'CANCELLED',
] as const;
export type EventRequestStatus = (typeof EVENT_REQUEST_STATUSES)[number];

export const EVENT_REQUEST_PATHS = ['BUILD', 'EXISTING', 'TICKETS_ONLY'] as const;
export type EventRequestPath = (typeof EVENT_REQUEST_PATHS)[number];

/** The database's cap on one request (D3); the manifest may set a lower one. */
export const MAX_EVENT_SEATS = 8;

/** A derived trip never runs longer than this (one route stop's limit). */
export const MAX_EVENT_TRIP_NIGHTS = 30;

const DAY_MS = 86_400_000;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** Tickets a request needs: one per seat for a pass, else one per seat per night. */
export function ticketCount(
  kind: SeatCategoryKind,
  seats: number,
  nightCount: number,
): number {
  return kind === 'PASS' ? seats : seats * nightCount;
}

/**
 * The storefront lists a published event until its last day has passed in
 * Havana, so an event leaves the list without anyone archiving it (D2).
 */
export function eventIsListed(
  event: { status: EventStatus; endsOn: Date },
  now: Date,
): boolean {
  return (
    event.status === 'PUBLISHED' &&
    event.endsOn.getTime() >= zonedCalendarDay(now).getTime()
  );
}

/** A listed event takes seat requests unless its events are free (GUIDE_ONLY). */
export function eventTakesRequests(
  event: { status: EventStatus; access: EventAccess; endsOn: Date },
  now: Date,
): boolean {
  return eventIsListed(event, now) && event.access !== 'GUIDE_ONLY';
}

export type EventIssue =
  'NO_CATEGORIES' | 'NO_NIGHTS' | 'NIGHT_OUTSIDE_DATES' | 'CONFIRM_AFTER_START' | 'ENDED';

/**
 * Why an event cannot be published, or an empty list. A guide-only event
 * takes no seats, so it needs neither categories nor nights; any other needs
 * a category, and nights when a category is sold per night. Nights lie inside
 * the event's dates, and seats are confirmed before it starts.
 */
export function eventPublishIssues(
  event: {
    access: EventAccess;
    startsOn: Date;
    endsOn: Date;
    confirmBy: Date | null;
    nights: readonly { date: Date }[];
    categories: readonly { kind: SeatCategoryKind }[];
  },
  now: Date,
): EventIssue[] {
  const issues: EventIssue[] = [];
  if (event.access !== 'GUIDE_ONLY') {
    if (event.categories.length === 0) issues.push('NO_CATEGORIES');
    if (
      event.nights.length === 0 &&
      event.categories.some((category) => category.kind !== 'PASS')
    ) {
      issues.push('NO_NIGHTS');
    }
  }
  if (
    event.nights.some(
      (night) =>
        night.date.getTime() < event.startsOn.getTime() ||
        night.date.getTime() > event.endsOn.getTime(),
    )
  ) {
    issues.push('NIGHT_OUTSIDE_DATES');
  }
  if (event.confirmBy && event.confirmBy.getTime() > event.startsOn.getTime()) {
    issues.push('CONFIRM_AFTER_START');
  }
  if (event.endsOn.getTime() < zonedCalendarDay(now).getTime()) issues.push('ENDED');
  return issues;
}

export type EventRequestIssue =
  | 'EVENT_CLOSED'
  | 'CATEGORY'
  | 'NIGHTS_REQUIRED'
  | 'PASS_HAS_NIGHTS'
  | 'NIGHT'
  | 'DUPLICATE_NIGHT'
  | 'SEATS';

export interface RequestableEvent {
  status: EventStatus;
  access: EventAccess;
  endsOn: Date;
  nights: readonly { id: string }[];
  categories: readonly { id: string; kind: SeatCategoryKind }[];
}

export interface EventRequestChoice {
  categoryId: string;
  nightIds: readonly string[];
  seats: number;
}

/**
 * Why a request cannot be taken, or an empty list (D3). The category and every
 * night must belong to the event; a pass covers every night, so it names none;
 * any other category names at least one night.
 */
export function eventRequestIssues(
  event: RequestableEvent,
  choice: EventRequestChoice,
  maxSeats: number,
  now: Date,
): EventRequestIssue[] {
  const issues: EventRequestIssue[] = [];
  if (!eventTakesRequests(event, now)) issues.push('EVENT_CLOSED');
  const category = event.categories.find(
    (candidate) => candidate.id === choice.categoryId,
  );
  if (!category) {
    issues.push('CATEGORY');
  } else if (category.kind === 'PASS') {
    if (choice.nightIds.length > 0) issues.push('PASS_HAS_NIGHTS');
  } else if (choice.nightIds.length === 0) {
    issues.push('NIGHTS_REQUIRED');
  }
  const nightIds = new Set(event.nights.map((night) => night.id));
  if (choice.nightIds.some((id) => !nightIds.has(id))) issues.push('NIGHT');
  if (new Set(choice.nightIds).size !== choice.nightIds.length) {
    issues.push('DUPLICATE_NIGHT');
  }
  const cap = Math.min(maxSeats, MAX_EVENT_SEATS);
  if (!Number.isInteger(choice.seats) || choice.seats < 1 || choice.seats > cap) {
    issues.push('SEATS');
  }
  return issues;
}

const EVENT_REQUEST_MOVES: Record<EventRequestStatus, readonly EventRequestStatus[]> = {
  SUBMITTED: ['REQUESTING', 'UNAVAILABLE', 'CANCELLED'],
  REQUESTING: ['CONFIRMED', 'UNAVAILABLE', 'CANCELLED'],
  // A confirmed request is cancelled only with its booking (D3).
  CONFIRMED: ['CANCELLED'],
  UNAVAILABLE: [],
  CANCELLED: [],
};

export function canMoveEventRequest(
  from: EventRequestStatus,
  to: EventRequestStatus,
): boolean {
  return EVENT_REQUEST_MOVES[from].includes(to);
}

/** Still waiting on the desk: nothing confirmed and nothing closed. */
export function isOpenEventRequest(status: EventRequestStatus): boolean {
  return status === 'SUBMITTED' || status === 'REQUESTING';
}

/** The traveler withdraws only what is not yet confirmed (D3). */
export function travelerMayCancelEventRequest(status: EventRequestStatus): boolean {
  return isOpenEventRequest(status);
}

/**
 * A submitted request the desk has not answered within the threshold (D7,
 * the board's "within 48 hours"); derived on read, as payment alerts are.
 */
export function eventRequestAnswerOverdue(
  request: { status: EventRequestStatus; createdAt: Date },
  now: Date,
  answerHours: number,
): boolean {
  return (
    request.status === 'SUBMITTED' &&
    now.getTime() - request.createdAt.getTime() > answerHours * 3_600_000
  );
}

/** The first and last festival night a request covers, as UTC calendar days. */
export interface FestivalWindow {
  first: Date;
  last: Date;
}

/**
 * The chosen nights' span, or the whole event for a pass. The last night's
 * date is the evening of the concert; the stay runs to the next morning.
 */
export function festivalWindow(
  event: { startsOn: Date; endsOn: Date; nights: readonly { id: string; date: Date }[] },
  kind: SeatCategoryKind,
  nightIds: readonly string[],
): FestivalWindow {
  if (kind === 'PASS' || nightIds.length === 0) {
    return { first: event.startsOn, last: event.endsOn };
  }
  const times = event.nights
    .filter((night) => nightIds.includes(night.id))
    .map((night) => night.date.getTime());
  return { first: new Date(Math.min(...times)), last: new Date(Math.max(...times)) };
}

export interface DerivedTripInput {
  path: 'BUILD' | 'TICKETS_ONLY';
  /** The event's province (CU01…). */
  province: string;
  window: FestivalWindow;
  seats: number;
  /** BUILD: the day the traveler lands. */
  arrival?: Date;
  /** BUILD: the trip's nights in total. */
  totalNights?: number;
  /** BUILD: where the trip goes after the festival; null stays in the event's province. */
  afterProvince?: string | null;
}

export interface DerivedTrip {
  startDate: Date;
  endDate: Date;
  adults: number;
  route: { province: string; nights: number }[];
}

export type DerivedTripIssue =
  'ARRIVAL_REQUIRED' | 'ARRIVAL_AFTER_FIRST_NIGHT' | 'TOO_SHORT' | 'TOO_LONG';

/**
 * The M5 custom request a BUILD or TICKETS_ONLY request creates (D5): the
 * event's province from arrival to the morning after the last night, then
 * the chosen place for the rest. Tickets only is the smallest such trip: the
 * festival nights alone, as the board's "we propose the smallest trip".
 */
export function derivedTrip(
  input: DerivedTripInput,
): { trip: DerivedTrip } | { issue: DerivedTripIssue } {
  const departure = addDays(input.window.last, 1);
  if (input.path === 'TICKETS_ONLY') {
    const nights = daysBetween(input.window.first, departure);
    if (nights > MAX_EVENT_TRIP_NIGHTS) return { issue: 'TOO_LONG' };
    return {
      trip: {
        startDate: input.window.first,
        endDate: departure,
        adults: input.seats,
        route: [{ province: input.province, nights }],
      },
    };
  }

  if (!input.arrival || input.totalNights === undefined) {
    return { issue: 'ARRIVAL_REQUIRED' };
  }
  if (input.arrival.getTime() > input.window.first.getTime()) {
    return { issue: 'ARRIVAL_AFTER_FIRST_NIGHT' };
  }
  const festivalNights = daysBetween(input.arrival, departure);
  if (input.totalNights < festivalNights) return { issue: 'TOO_SHORT' };
  if (input.totalNights > MAX_EVENT_TRIP_NIGHTS) return { issue: 'TOO_LONG' };

  const rest = input.totalNights - festivalNights;
  const after = input.afterProvince ?? null;
  const route =
    rest > 0 && after && after !== input.province
      ? [
          { province: input.province, nights: festivalNights },
          { province: after, nights: rest },
        ]
      : [{ province: input.province, nights: input.totalNights }];
  return {
    trip: {
      startDate: input.arrival,
      endDate: addDays(input.arrival, input.totalNights),
      adults: input.seats,
      route,
    },
  };
}

const UNLINKABLE_BOOKING_STATUSES: readonly string[] = ['CANCELLED', 'COMPLETED'];

/**
 * A booking of the traveler's that seats can go onto (D5 EXISTING): still
 * open, and not over before the event starts.
 */
export function isLinkableBooking(
  booking: { status: string; endDate: Date },
  event: { startsOn: Date },
): boolean {
  return (
    !UNLINKABLE_BOOKING_STATUSES.includes(booking.status) &&
    booking.endDate.getTime() >= event.startsOn.getTime()
  );
}

export interface TicketCharges {
  tickets: number;
  ticketsAmount: number;
  feeAmount: number;
  total: number;
}

/** What confirmed seats add to the booking: the tickets and the concierge fee (D6). */
export function ticketCharges(
  tickets: number,
  pricePerSeat: number,
  feePerSeat: number,
): TicketCharges {
  const ticketsAmount = round2(tickets * pricePerSeat);
  const feeAmount = round2(tickets * feePerSeat);
  return { tickets, ticketsAmount, feeAmount, total: round2(ticketsAmount + feeAmount) };
}

/**
 * When the ticket instalment falls due once the price is locked (D6): the
 * manifest's payment days after confirmation, or the unpaid balance's due
 * date when that comes first and has not passed.
 */
export function ticketInstalmentDueAt(
  confirmedAt: Date,
  paymentDays: number,
  unpaidBalanceDueAt: Date | null,
): Date {
  const byDays = addDays(confirmedAt, paymentDays);
  if (
    unpaidBalanceDueAt &&
    unpaidBalanceDueAt.getTime() > confirmedAt.getTime() &&
    unpaidBalanceDueAt.getTime() < byDays.getTime()
  ) {
    return unpaidBalanceDueAt;
  }
  return byDays;
}
