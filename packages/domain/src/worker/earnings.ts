import {
  calculateSupplierReliability,
  meetsReliabilityFloor,
  type ReliabilityOffer,
} from '../dispatch/reliability';
import { ReservationStatus } from '../reservation/status';
import { JOB_STATUSES } from '../supplier/resources';
import { workerToday } from './calendar';

/**
 * W-Earnings, read-only (`docs/worker-app-plan.md` §8): what the worker has
 * earned and been paid, and their reliability as the desk's floor reads it.
 * Built on the existing columns: a service item's `payoutRate` and
 * `payoutStatus`, and the dispatch-offer ledger. A paid date, the payout
 * method and receipts wait on `docs/schema-w-earnings.md`. Pure: the API
 * reads the rows.
 */

/** How the app names a job's payout: owed, paid, or held by an issue. */
export const WORKER_PAYOUT_STATES = ['PENDING', 'PAID', 'ISSUE'] as const;
export type WorkerPayoutState = (typeof WORKER_PAYOUT_STATES)[number];

/** Finished jobs W-Earnings' "Historial" lists, newest first. */
export const WORKER_EARNINGS_HISTORY = 20;

/** A taken job with its payout, as the API reads it. */
export interface WorkerEarningsJob {
  status: string;
  reservationStatus: string;
  endsAt: Date;
  /** The payout in cents of the base currency, so sums stay exact. */
  payoutCents: number;
  payoutStatus: string;
}

export interface EarningsTotal {
  cents: number;
  jobs: number;
}

export interface WorkerEarnings<T extends WorkerEarningsJob> {
  /** Finished jobs not yet paid (accrued or being processed). */
  pending: EarningsTotal;
  /** Finished jobs that ended this month in Havana, whatever their payout state. */
  thisMonth: EarningsTotal;
  /** Paid jobs that ended this year in Havana; there is no paid date yet. */
  paidThisYear: EarningsTotal;
  /** Jobs whose payout failed: the desk has to look at them. */
  issue: EarningsTotal;
  /** The Havana year `paidThisYear` covers. */
  year: number;
  history: (T & { payoutState: WorkerPayoutState })[];
}

/**
 * A job counts toward pay once it was taken, its service has ended and the
 * booking was not cancelled. Nothing marks a job `FULFILLED` yet, so the end
 * of the service is what makes it finished.
 */
export function isFinishedJob(job: WorkerEarningsJob, now: Date): boolean {
  return (
    (JOB_STATUSES as readonly string[]).includes(job.status) &&
    job.reservationStatus !== ReservationStatus.Cancelled &&
    job.endsAt.getTime() <= now.getTime()
  );
}

export function workerPayoutState(payoutStatus: string): WorkerPayoutState {
  if (payoutStatus === 'SETTLED') return 'PAID';
  if (payoutStatus === 'FAILED') return 'ISSUE';
  return 'PENDING';
}

function add(total: EarningsTotal, cents: number): void {
  total.cents += cents;
  total.jobs += 1;
}

/** The worker's payouts over their finished jobs, months and years on Havana's calendar. */
export function workerEarnings<T extends WorkerEarningsJob>(
  jobs: readonly T[],
  now: Date,
  historySize: number = WORKER_EARNINGS_HISTORY,
): WorkerEarnings<T> {
  const today = workerToday(now);
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  const pending = { cents: 0, jobs: 0 };
  const thisMonth = { cents: 0, jobs: 0 };
  const paidThisYear = { cents: 0, jobs: 0 };
  const issue = { cents: 0, jobs: 0 };

  const finished = jobs
    .filter((job) => isFinishedJob(job, now))
    .map((job) => ({ ...job, payoutState: workerPayoutState(job.payoutStatus) }))
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime());

  for (const job of finished) {
    const ended = workerToday(job.endsAt);
    if (job.payoutState === 'PENDING') add(pending, job.payoutCents);
    if (job.payoutState === 'ISSUE') add(issue, job.payoutCents);
    if (job.payoutState === 'PAID' && ended.startsWith(year)) {
      add(paidThisYear, job.payoutCents);
    }
    if (ended.startsWith(month)) add(thisMonth, job.payoutCents);
  }

  return {
    pending,
    thisMonth,
    paidThisYear,
    issue,
    year: Number(year),
    history: finished.slice(0, historySize),
  };
}

/** W-Earnings' "Tu fiabilidad": the share of answered offers each way, in whole percent. */
export interface WorkerReliabilityView {
  answered: number;
  /** Accepted over answered, 0–100; null until `minAnswered` answers. */
  score: number | null;
  acceptedPercent: number;
  declinedPercent: number;
  timedOutPercent: number;
  minAnswered: number;
  floorPercent: number;
  /** Whether automatic offers keep coming, as the desk's floor decides. */
  meetsFloor: boolean;
}

/**
 * The worker's reliability over every offer in their ledger, the same reading
 * the desk's floor and the supplier inspector use, so the number the worker
 * sees is the one that decides automatic offers.
 */
export function workerReliability(
  offers: readonly ReliabilityOffer[],
  floorPercent: number,
  minAnswered: number,
): WorkerReliabilityView {
  const [card] = calculateSupplierReliability([...offers]);
  const answered = card?.answered ?? 0;
  const percent = (part: number) =>
    answered > 0 ? Math.round((part / answered) * 100) : 0;
  return {
    answered,
    score: card && answered >= minAnswered ? Math.round(card.acceptanceRate * 100) : null,
    acceptedPercent: percent(card?.accepted ?? 0),
    declinedPercent: percent(card?.declined ?? 0),
    timedOutPercent: percent(card?.timedOut ?? 0),
    minAnswered,
    floorPercent,
    meetsFloor: meetsReliabilityFloor(card ?? null, floorPercent / 100, minAnswered),
  };
}
