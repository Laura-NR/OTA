import { ReservationStatus } from '../reservation/status';
import { OPS_TIME_ZONE, zonedMidnight } from '../time/ops-calendar';
import { workerToday } from './calendar';
import { isFinishedJob, workerPayoutState, type WorkerEarningsJob } from './earnings';

/**
 * W-Earnings payouts (`docs/schema-w-earnings.md`, approved E1–E8): a payment
 * is recorded after the money changed hands, covering one or more finished
 * jobs, and the next pay day follows a rule rather than a stored date (E4).
 * Pure: the API reads the rows and writes the payment.
 */

/** How a worker is paid (E2): cash at the office or a bank transfer. */
export const PAYOUT_METHODS = ['CASH_OFFICE', 'BANK_TRANSFER'] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

/** The most jobs one payment may cover; a desk form, not a batch run. */
export const PAYOUT_MAX_JOBS = 50;

/** One weekly window when the office pays (`HH:MM`, Havana time). */
export interface PayoutSession {
  /** ISO weekday: 1 is Monday, 7 is Sunday. */
  weekday: number;
  from: string;
  to: string;
}

/** E4: jobs are paid `businessDays` after they end, at the office's sessions. */
export interface PayoutRule {
  businessDays: number;
  sessions: readonly PayoutSession[];
}

export interface NextPayDay {
  /** `YYYY-MM-DD` in Havana. */
  day: string;
  from: string;
  to: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayTime(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function dayString(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** ISO weekday of a `YYYY-MM-DD` day. */
function isoWeekday(day: string): number {
  return new Date(dayTime(day)).getUTCDay() || 7;
}

/**
 * The Havana day a job's payout falls due: `businessDays` Monday-to-Friday
 * days after the day its service ended. Public holidays are not counted out.
 */
export function payoutDueDay(endsAt: Date, businessDays: number): string {
  let time = dayTime(workerToday(endsAt));
  let left = businessDays;
  while (left > 0) {
    time += DAY_MS;
    if (isoWeekday(dayString(time)) <= 5) left -= 1;
  }
  return dayString(time);
}

/** Minutes after midnight of an `HH:MM` time. */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** Whether a session on `day` has already closed at `now`, on Havana's clock. */
function sessionOver(day: string, session: PayoutSession, now: Date): boolean {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const closes =
    zonedMidnight(year, month, date, OPS_TIME_ZONE).getTime() +
    minutesOf(session.to) * 60_000;
  return now.getTime() >= closes;
}

/**
 * The next office session at which the worker collects something: the first
 * session on or after the earliest due day among their pending jobs, and not
 * already over. Jobs with a payout issue wait for the desk instead. Null when
 * nothing is pending or the office has no sessions.
 */
export function nextPayDay(
  jobs: readonly WorkerEarningsJob[],
  now: Date,
  rule: PayoutRule,
): NextPayDay | null {
  if (rule.sessions.length === 0) return null;
  const due = jobs
    .filter(
      (job) =>
        isFinishedJob(job, now) && workerPayoutState(job.payoutStatus) === 'PENDING',
    )
    .map((job) => payoutDueDay(job.endsAt, rule.businessDays))
    .sort()[0];
  if (!due) return null;

  const today = workerToday(now);
  const first = due > today ? due : today;
  const sessions = [...rule.sessions].sort(
    (a, b) => minutesOf(a.from) - minutesOf(b.from),
  );
  // A week covers every weekday; the second one catches a session already over today.
  for (let time = dayTime(first), end = time + 14 * DAY_MS; time < end; time += DAY_MS) {
    const day = dayString(time);
    const session = sessions.find(
      (candidate) =>
        candidate.weekday === isoWeekday(day) && !sessionOver(day, candidate, now),
    );
    if (session) return { day, from: session.from, to: session.to };
  }
  return null;
}

/** A job the desk picked for a payment, as the API reads it. */
export interface PayoutCandidate extends WorkerEarningsJob {
  supplierId: string | null;
  payoutId: string | null;
}

export type PayoutRecordRefusal =
  | 'NO_JOBS'
  | 'TOO_MANY_JOBS'
  | 'NOT_THIS_WORKER'
  | 'CANCELLED'
  | 'NOT_FINISHED'
  | 'ALREADY_PAID'
  | 'PAID_IN_FUTURE'
  | 'PAID_BEFORE_END';

/**
 * Why a payment cannot be recorded (`docs/schema-w-earnings.md` §5), or null.
 * `requested` is how many jobs the desk picked; any the read did not find,
 * or found on another worker, refuse the whole payment. A failed payout may
 * be paid; a settled one may not be paid twice. The day paid is a Havana day
 * no later than today and no earlier than the last job's end.
 */
export function payoutRecordRefusal(
  supplierId: string,
  requested: number,
  jobs: readonly PayoutCandidate[],
  paidDay: string,
  now: Date,
): PayoutRecordRefusal | null {
  if (requested === 0) return 'NO_JOBS';
  if (requested > PAYOUT_MAX_JOBS) return 'TOO_MANY_JOBS';
  if (jobs.length < requested || jobs.some((job) => job.supplierId !== supplierId)) {
    return 'NOT_THIS_WORKER';
  }
  if (jobs.some((job) => job.reservationStatus === ReservationStatus.Cancelled)) {
    return 'CANCELLED';
  }
  if (jobs.some((job) => !isFinishedJob(job, now))) return 'NOT_FINISHED';
  if (jobs.some((job) => job.payoutId !== null || job.payoutStatus === 'SETTLED')) {
    return 'ALREADY_PAID';
  }
  if (paidDay > workerToday(now)) return 'PAID_IN_FUTURE';
  if (jobs.some((job) => paidDay < workerToday(job.endsAt))) return 'PAID_BEFORE_END';
  return null;
}

/** What one payment hands over: the jobs' payouts, summed in cents. */
export function payoutAmountCents(
  jobs: readonly Pick<WorkerEarningsJob, 'payoutCents'>[],
) {
  return jobs.reduce((sum, job) => sum + job.payoutCents, 0);
}
