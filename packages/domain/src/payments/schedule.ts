/**
 * M4 payment schedule (`docs/schema-m4-payment-schedule.md`, D1–D3, D6). A
 * booking is paid in full, or by a deposit and a balance when the package's
 * deposit plan allows it. The terms come from the tenant manifest; these rules
 * only turn them into amounts and due dates, so they are pure and tested.
 */

export type PaymentPlan = 'DEPOSIT' | 'FULL';

export type InstalmentKind = 'DEPOSIT' | 'BALANCE' | 'FULL';

/** A deposit plan from the manifest (M4 D2). */
export interface DepositPolicy {
  /** The share of the total paid first. */
  percent: number;
  /** A deposit is offered only when departure is further away than this. */
  minDaysBeforeDeparture: number;
  /** The balance falls due this many days before departure. */
  balanceDaysBeforeDeparture: number;
}

export interface ScheduledInstalment {
  kind: InstalmentKind;
  amount: number;
  dueAt: Date;
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Whole days from `now` until departure (a calendar date at UTC midnight). */
export function daysBeforeDeparture(departure: Date, now: Date): number {
  return Math.floor((departure.getTime() - now.getTime()) / DAY_MS);
}

/** True when the plan exists and departure is far enough away for a deposit. */
export function depositEligible(
  policy: DepositPolicy | null,
  departure: Date,
  now: Date,
): boolean {
  return (
    policy !== null && daysBeforeDeparture(departure, now) > policy.minDaysBeforeDeparture
  );
}

export interface ScheduleInput {
  total: number;
  plan: PaymentPlan;
  policy: DepositPolicy | null;
  departure: Date;
  now: Date;
  /** The window for the first payment (spec §4.2, "e.g., 48 hours"). */
  windowHours: number;
}

/**
 * The instalments for a plan: one FULL amount due when the window closes, or a
 * DEPOSIT due then and the BALANCE due before departure. The two add up to the
 * total. Null when a deposit is asked for but not offered.
 */
export function buildSchedule(input: ScheduleInput): ScheduledInstalment[] | null {
  const firstDue = new Date(input.now.getTime() + input.windowHours * HOUR_MS);
  if (input.plan === 'FULL') {
    return [{ kind: 'FULL', amount: round2(input.total), dueAt: firstDue }];
  }
  if (!depositEligible(input.policy, input.departure, input.now)) {
    return null;
  }
  const policy = input.policy!;
  const deposit = round2((input.total * policy.percent) / 100);
  return [
    { kind: 'DEPOSIT', amount: deposit, dueAt: firstDue },
    {
      kind: 'BALANCE',
      amount: round2(input.total - deposit),
      dueAt: new Date(
        input.departure.getTime() - policy.balanceDaysBeforeDeparture * DAY_MS,
      ),
    },
  ];
}

/** The card surcharge on an amount (M4 D6); 0 % until counsel sets a rate. */
export function cardFee(amount: number, percent: number): number {
  return round2((amount * percent) / 100);
}

/** `days` working days (Monday to Friday, UTC) after `from`, at the same time. */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const weekday = result.getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      added += 1;
    }
  }
  return result;
}

export type PaymentAlert = 'WINDOW_EXPIRED' | 'BALANCE_OVERDUE';

/** Bookings that no longer expect a payment. */
const SETTLED_STATUSES: readonly string[] = ['COMPLETED', 'CANCELLED'];

/**
 * What the next instalment means for the desk once its date has passed (M4
 * D3–D4): a deposit or full payment past its window waits for the desk to
 * extend or cancel; a balance past due is overdue. Neither changes the
 * booking's status by itself.
 */
export function paymentAlert(
  next: { kind: InstalmentKind; dueAt: Date } | null,
  status: string,
  now: Date,
): PaymentAlert | null {
  if (
    !next ||
    SETTLED_STATUSES.includes(status) ||
    next.dueAt.getTime() > now.getTime()
  ) {
    return null;
  }
  return next.kind === 'BALANCE' ? 'BALANCE_OVERDUE' : 'WINDOW_EXPIRED';
}
