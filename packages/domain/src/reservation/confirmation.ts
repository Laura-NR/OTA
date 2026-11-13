import { ReservationStatus } from './status';

/**
 * The traveler's Confirmation screen (Confirmation / M-Confirmation boards):
 * the page a booking earns once its first payment has been received and it is
 * confirmed. It stays reachable for the rest of the trip's life.
 */
export const CONFIRMATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.Confirmed,
  ReservationStatus.InProgress,
  ReservationStatus.Completed,
];

/**
 * A booking has a confirmation once it is confirmed (or later) and money has
 * been received for it: the deposit or full payment under M4, or a receipt
 * paid before M4. A booking moved to CONFIRMED by hand with nothing paid has
 * none.
 */
export function hasConfirmation(status: ReservationStatus, paid: number): boolean {
  return CONFIRMATION_STATUSES.includes(status) && paid > 0;
}

/** One thing left for the traveler before departure, most pressing first. */
export type PreTripStep =
  | { kind: 'CERTIFY'; missing: number }
  | {
      kind: 'PAY';
      instalmentKind: string;
      amount: string;
      dueAt: string;
      overdue: boolean;
    }
  | { kind: 'TRAVEL_INFO' };

export interface PreTripInput {
  status: ReservationStatus;
  /** US travelers still without an OFAC certification (M3). */
  ofacMissing: number;
  /** The next instalment still due, if any (M4). */
  nextInstalment: {
    kind: string;
    amount: string;
    dueAt: string;
  } | null;
  now: Date;
}

/**
 * The "Before you fly" list, in order: a missing US certification first (it
 * holds the voucher), then the next payment due, then the entry requirements.
 * Only steps backed by data are listed; once the trip has started there is
 * nothing left to prepare.
 */
export function preTripSteps(input: PreTripInput): PreTripStep[] {
  if (input.status !== ReservationStatus.Confirmed) {
    return [];
  }
  const steps: PreTripStep[] = [];
  if (input.ofacMissing > 0) {
    steps.push({ kind: 'CERTIFY', missing: input.ofacMissing });
  }
  if (input.nextInstalment) {
    steps.push({
      kind: 'PAY',
      instalmentKind: input.nextInstalment.kind,
      amount: input.nextInstalment.amount,
      dueAt: input.nextInstalment.dueAt,
      overdue: new Date(input.nextInstalment.dueAt).getTime() < input.now.getTime(),
    });
  }
  steps.push({ kind: 'TRAVEL_INFO' });
  return steps;
}

export interface TripCalendarInput {
  /** Stable across downloads, so a calendar updates the event, not duplicates it. */
  uid: string;
  title: string;
  description: string;
  /** Calendar days stored at UTC midnight; the end day is the last day of the trip. */
  startDate: string;
  endDate: string;
  now: Date;
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are escaped. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: lines longer than 75 octets continue on a line led by a space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function calendarDay(value: string, addDays = 0): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + addDays);
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function timestamp(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/**
 * The trip as an all-day calendar event (RFC 5545), for "Add to calendar". The
 * end is exclusive in iCalendar, so it is the day after the last day.
 */
export function tripCalendar(input: TripCalendarInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OTA//Trip confirmation//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeText(input.uid)}`,
    `DTSTAMP:${timestamp(input.now)}`,
    `DTSTART;VALUE=DATE:${calendarDay(input.startDate)}`,
    `DTEND;VALUE=DATE:${calendarDay(input.endDate, 1)}`,
    `SUMMARY:${escapeText(input.title)}`,
    `DESCRIPTION:${escapeText(input.description)}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
