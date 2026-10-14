import { ServiceItemStatus } from '../reservation/status';
import { escalationAlert, type EscalationAlert } from './policy';

/**
 * A-Dashboard "Pending confirmations · by age": how long each booking has been
 * waiting on at least one worker, in four buckets. A bucket holds waits up to
 * `maxHours` (exclusive); the last one has no bound.
 */
export const AGING_BUCKETS = [
  { id: 'upTo2h', maxHours: 2 },
  { id: 'upTo6h', maxHours: 6 },
  { id: 'upTo24h', maxHours: 24 },
  { id: 'over24h', maxHours: null },
] as const;

export type AgingBucketId = (typeof AGING_BUCKETS)[number]['id'];

const HOUR_MS = 60 * 60 * 1000;

/** The bucket for a booking that has been waiting since `since`. */
export function agingBucket(since: Date, now: Date): AgingBucketId {
  const waitedHours = Math.max(0, now.getTime() - since.getTime()) / HOUR_MS;
  for (const bucket of AGING_BUCKETS) {
    if (bucket.maxHours === null || waitedHours < bucket.maxHours) {
      return bucket.id;
    }
  }
  return 'over24h';
}

const SETTLED_ITEM_STATUSES: readonly ServiceItemStatus[] = [
  ServiceItemStatus.Accepted,
  ServiceItemStatus.Fulfilled,
];

/** A booking waits on a worker while any of its items is not yet accepted. */
export function isAwaitingWorker(itemStatuses: readonly ServiceItemStatus[]): boolean {
  return itemStatuses.some((status) => !SETTLED_ITEM_STATUSES.includes(status));
}

export interface PendingBooking {
  /** When the booking started waiting: its first offer (a re-dispatch keeps it). */
  waitingSince: Date;
  itemStatuses: readonly ServiceItemStatus[];
}

export interface PendingConfirmations {
  total: number;
  buckets: Record<AgingBucketId, number>;
}

/** Count the bookings still waiting on a worker, by how long they have waited. */
export function pendingConfirmations(
  bookings: readonly PendingBooking[],
  now: Date,
): PendingConfirmations {
  const buckets = Object.fromEntries(
    AGING_BUCKETS.map((bucket) => [bucket.id, 0]),
  ) as Record<AgingBucketId, number>;
  let total = 0;
  for (const booking of bookings) {
    if (!isAwaitingWorker(booking.itemStatuses)) {
      continue;
    }
    buckets[agingBucket(booking.waitingSince, now)] += 1;
    total += 1;
  }
  return { total, buckets };
}

/** The share of an offer's window already used, from 0 to 1 ("76 % of timer"). */
export function timerElapsed(offeredAt: Date, deadline: Date, now: Date): number {
  const window = deadline.getTime() - offeredAt.getTime();
  if (window <= 0) {
    return 1;
  }
  return Math.min(1, Math.max(0, (now.getTime() - offeredAt.getTime()) / window));
}

export interface ServiceItemClock {
  status: ServiceItemStatus;
  offeredAt: Date | null;
  deadline: Date | null;
  now: Date;
}

/**
 * The alert a service item raises on the desk: red once declined or timed out,
 * amber or red from an open offer's clock, otherwise none (spec §4.3).
 */
export function serviceItemAlert({
  status,
  offeredAt,
  deadline,
  now,
}: ServiceItemClock): EscalationAlert {
  if (status === ServiceItemStatus.Declined || status === ServiceItemStatus.Timeout) {
    return 'RED';
  }
  if (status === ServiceItemStatus.Offered && offeredAt && deadline) {
    return escalationAlert({ offeredAt, deadline, now });
  }
  return 'NONE';
}
