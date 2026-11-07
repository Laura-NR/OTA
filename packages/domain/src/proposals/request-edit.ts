import type { FestivalWindow } from '../events/concierge';

/**
 * "Keep building the trip" (M10's deferred builder edit): the traveler
 * reopens a submitted custom request in the builder. These rules decide when
 * that is allowed, what an edit changed (for the desk's note), and whether
 * the edited trip still carries the event seats linked to it.
 */

/** The parts of a request an edit can change, in the order the desk lists them. */
export const REQUEST_CHANGES = [
  'dates',
  'party',
  'route',
  'stays',
  'pace',
  'interests',
  'transport',
  'activities',
  'guiding',
  'access',
  'nationality',
  'budget',
  'notes',
  'language',
] as const;

export type RequestChange = (typeof REQUEST_CHANGES)[number];

/**
 * Editable until the desk sends a proposal: the request is still open and
 * its proposal has no sent version. After that the traveler writes to the
 * desk instead, so a sent price never describes answers that moved under it.
 */
export function customRequestEditable(state: {
  requestStatus: string;
  proposalStatus: string;
}): boolean {
  return state.requestStatus === 'OPEN' && state.proposalStatus === 'DRAFT';
}

/** A request's answers as stored: dates as ISO strings, optionals null. */
export interface RequestAnswers {
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  inventoryItemIds: readonly string[];
  nationality: string | null;
  budgetPerPerson: number | null;
  interests: readonly string[];
  pace: string | null;
  route: readonly { province: string; nights: number; stay?: string | null }[];
  transport: string | null;
  guiding: string | null;
  interpreter: boolean;
  stepFree: boolean;
  notes: string | null;
  locale: string | null;
}

function day(iso: string): string {
  return iso.slice(0, 10);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/**
 * What an edit changed. The route is the ordered stops with their nights; a
 * stay counts as changed only for a stop on both routes, since a new stop
 * already shows as a route change.
 */
export function customRequestChanges(
  before: RequestAnswers,
  after: RequestAnswers,
): RequestChange[] {
  const stays = new Map(before.route.map((stop) => [stop.province, stop.stay ?? null]));
  const changed: Record<RequestChange, boolean> = {
    dates:
      day(before.startDate) !== day(after.startDate) ||
      day(before.endDate) !== day(after.endDate),
    party: before.adults !== after.adults || before.children !== after.children,
    route:
      before.route.length !== after.route.length ||
      before.route.some(
        (stop, index) =>
          stop.province !== after.route[index]?.province ||
          stop.nights !== after.route[index]?.nights,
      ),
    stays: after.route.some(
      (stop) =>
        stays.has(stop.province) && stays.get(stop.province) !== (stop.stay ?? null),
    ),
    pace: before.pace !== after.pace,
    interests: !sameSet(before.interests, after.interests),
    transport: before.transport !== after.transport,
    activities: !sameSet(before.inventoryItemIds, after.inventoryItemIds),
    guiding: before.guiding !== after.guiding || before.interpreter !== after.interpreter,
    access: before.stepFree !== after.stepFree,
    nationality: before.nationality !== after.nationality,
    budget: before.budgetPerPerson !== after.budgetPerPerson,
    notes: (before.notes ?? '') !== (after.notes ?? ''),
    language: before.locale !== after.locale,
  };
  return REQUEST_CHANGES.filter((key) => changed[key]);
}

/** An event request whose seats ride on the request being edited. */
export interface LinkedEventSeats {
  /** The event request's reference (VX-E-…). */
  reference: string;
  eventName: string;
  /** The event's province (CU01…). */
  province: string;
  window: FestivalWindow;
  seats: number;
}

export type RequestEditRefusalKind = 'EVENT_DATES' | 'EVENT_PARTY' | 'EVENT_PLACE';

export interface RequestEditRefusal {
  kind: RequestEditRefusalKind;
  reference: string;
  eventName: string;
}

const DAY_MS = 86_400_000;

/**
 * Why an edited trip can no longer carry its event seats: it must still be
 * in Cuba from the first festival night to the morning after the last, take
 * at least the seats' people, and stop in the event's province. A route
 * left empty names no province, so only the dates and party are checked.
 */
export function eventLinkRefusals(
  trip: {
    startDate: Date;
    endDate: Date;
    partySize: number;
    provinces: readonly string[];
  },
  links: readonly LinkedEventSeats[],
): RequestEditRefusal[] {
  return links.flatMap((link) => {
    const refusals: RequestEditRefusalKind[] = [];
    const morningAfter = link.window.last.getTime() + DAY_MS;
    if (
      trip.startDate.getTime() > link.window.first.getTime() ||
      trip.endDate.getTime() < morningAfter
    ) {
      refusals.push('EVENT_DATES');
    }
    if (trip.partySize < link.seats) {
      refusals.push('EVENT_PARTY');
    }
    if (trip.provinces.length > 0 && !trip.provinces.includes(link.province)) {
      refusals.push('EVENT_PLACE');
    }
    return refusals.map((kind) => ({
      kind,
      reference: link.reference,
      eventName: link.eventName,
    }));
  });
}
