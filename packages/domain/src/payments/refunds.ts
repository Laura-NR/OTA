/**
 * M4 refunds (`docs/schema-m4-payment-schedule.md`, D7): what the cancellation
 * scale returns, and who must approve a refund before it is sent.
 */

import { UserRole } from '../reservation/status';

/** From `fromDays` before departure (inclusive), the share of what was paid that is kept. */
export interface CancellationBand {
  fromDays: number;
  keepPercent: number;
  /** A fixed amount kept on top of the share (the "minus € 60"). */
  fee: number;
}

export interface CancellationQuote {
  band: CancellationBand;
  daysBefore: number;
  kept: number;
  refund: number;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The refund the scale gives for a cancellation `daysBefore` departure: the
 * band with the largest `fromDays` not above it applies, and its share is of
 * what was paid, as A-Payments works it ("30–15 days: 25 % kept" of the € 590
 * paid refunds € 442.50). The amount kept never exceeds what was paid. Null
 * when no band covers the day (an empty scale, or after departure with no
 * band from day 0).
 */
export function cancellationRefund(
  bands: readonly CancellationBand[],
  paid: number,
  daysBefore: number,
): CancellationQuote | null {
  const band = [...bands]
    .sort((a, b) => b.fromDays - a.fromDays)
    .find((candidate) => candidate.fromDays <= daysBefore);
  if (!band) {
    return null;
  }
  const kept = Math.min(paid, round2((paid * band.keepPercent) / 100 + band.fee));
  return { band, daysBefore, kept, refund: round2(paid - kept) };
}

/** The manifest's approval limits (A-Payments: € 500 alone, € 500–2,000 dual). */
export interface RefundThresholds {
  singleUpTo: number;
  dualUpTo: number;
}

export interface RefundVote {
  approverId: string;
  role: string;
  approve: boolean;
}

export type RefundDecision =
  | { state: 'APPROVED' }
  | { state: 'REJECTED' }
  | {
      state: 'PENDING';
      /** Approvals still to come from different people. */
      missing: number;
      /** Above the dual limit, a Super Admin must be one of them. */
      superAdmin: boolean;
    };

/**
 * Where a refund stands after its votes. One rejection rejects it. Up to the
 * single limit one approval is enough; up to the dual limit two different
 * people must approve; above it a Super Admin must. Force majeure changes the
 * amount, never these approvals.
 */
export function refundDecision(
  amount: number,
  votes: readonly RefundVote[],
  thresholds: RefundThresholds,
): RefundDecision {
  if (votes.some((vote) => !vote.approve)) {
    return { state: 'REJECTED' };
  }
  const approvers = new Set(votes.map((vote) => vote.approverId));

  if (amount > thresholds.dualUpTo) {
    return votes.some((vote) => vote.role === UserRole.SuperAdmin)
      ? { state: 'APPROVED' }
      : { state: 'PENDING', missing: 1, superAdmin: true };
  }
  const needed = amount > thresholds.singleUpTo ? 2 : 1;
  return approvers.size >= needed
    ? { state: 'APPROVED' }
    : { state: 'PENDING', missing: needed - approvers.size, superAdmin: false };
}

/** How long after one nudge the next may go out (AL-Alerts' "Nudge"). */
export const REFUND_NUDGE_COOLDOWN_MINUTES = 30;

/** A staff member who holds a refund vote by role. */
export interface RefundApprover {
  id: string;
  role: string;
}

export type RefundNudge =
  | { ok: true; recipients: string[] }
  | { ok: false; refusal: 'NOT_PENDING' | 'NO_ONE_LEFT' }
  | { ok: false; refusal: 'TOO_SOON'; retryAt: Date };

/**
 * Who a nudge for a pending refund reaches (AL-Alerts: "the second must come
 * from Dayana; this card lets you nudge her"): every approver who has not
 * voted, other than the one nudging, and only Super Admins when the refund
 * waits on one. `approvers` are the active staff whose role holds a vote. One
 * nudge per cooldown, whoever sends it, so a refund is not a stream of mail.
 */
export function refundNudge(input: {
  decision: RefundDecision;
  votes: readonly RefundVote[];
  approvers: readonly RefundApprover[];
  actorId: string;
  lastNudgedAt: Date | null;
  now: Date;
}): RefundNudge {
  const { decision } = input;
  if (decision.state !== 'PENDING') {
    return { ok: false, refusal: 'NOT_PENDING' };
  }
  if (input.lastNudgedAt) {
    const retryAt = new Date(
      input.lastNudgedAt.getTime() + REFUND_NUDGE_COOLDOWN_MINUTES * 60_000,
    );
    if (retryAt > input.now) {
      return { ok: false, refusal: 'TOO_SOON', retryAt };
    }
  }
  const voted = new Set(input.votes.map((vote) => vote.approverId));
  const recipients = input.approvers
    .filter(
      (approver) =>
        approver.id !== input.actorId &&
        !voted.has(approver.id) &&
        (!decision.superAdmin || approver.role === UserRole.SuperAdmin),
    )
    .map((approver) => approver.id);
  return recipients.length > 0
    ? { ok: true, recipients }
    : { ok: false, refusal: 'NO_ONE_LEFT' };
}

/**
 * Whether a person may take back their approval (AL-Alerts' "Withdraw"): only
 * while the refund still waits on others, and only their own approval. A
 * rejection already ended the refund, and an approved one is on its way.
 */
export function refundWithdrawal(
  status: string,
  votes: readonly RefundVote[],
  actorId: string,
): 'NOT_PENDING' | 'NO_APPROVAL' | null {
  if (status !== 'REQUESTED') {
    return 'NOT_PENDING';
  }
  return votes.some((vote) => vote.approverId === actorId && vote.approve)
    ? null
    : 'NO_APPROVAL';
}
