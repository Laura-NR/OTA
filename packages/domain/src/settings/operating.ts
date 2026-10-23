import type { DispatchTimers } from '../dispatch/policy';
import { UserRole } from '../reservation/status';

/**
 * M9 operating thresholds (`docs/schema-m9-settings.md` D1–D3, Q13). The
 * numbers the desk refers to live in one document, versioned in the
 * database; the domain functions take them as parameters, and these defaults
 * are the values the code ran on before M9. The payment window and the refund
 * limits default to the tenant manifest instead, which the API merges in.
 */

export const ADVISORY_DUAL_APPROVAL_LEVELS = ['CAUTION', 'CRITICAL'] as const;
export type AdvisoryDualApprovalLevel = (typeof ADVISORY_DUAL_APPROVAL_LEVELS)[number];

export interface OperatingThresholds {
  /** Minutes a worker has to accept a standard offer. */
  dispatchTimeoutMinutes: number;
  /** Minutes for an offer when arrival is within the short-notice window. */
  shortNoticeTimeoutMinutes: number;
  /** Hours before arrival under which the short-notice timer applies. */
  shortNoticeWindowHours: number;
  /** Share of an offer's timer, in percent, at which the desk sees amber. */
  amberPercent: number;
  /** Hours to make the first payment once the link is sent (M4). */
  paymentWindowHours: number;
  /** A refund up to this amount needs one approver (M4 D7). */
  refundSingleUpTo: number;
  /** Up to this amount two approvers; above it a Super Admin. */
  refundDualUpTo: number;
  /** Days before a credential's expiry from which auto-dispatch pauses. */
  credentialExpiryWindowDays: number;
  /** The lowest advisory severity that needs two approvals (M7). */
  advisoryDualApprovalFrom: AdvisoryDualApprovalLevel;
  /** Months after the latest completion before the keep-alive notice. */
  retentionTriggerMonths: number;
  /** Days a traveler has to answer the notice before anonymization. */
  retentionGraceDays: number;
  /** Days after which a resources confirmation is stale (M6). */
  resourcesStaleDays: number;
  /** Acceptance, in percent, below which auto-dispatch skips a supplier. */
  reliabilityFloorPercent: number;
  /** Answered offers before the floor applies. */
  reliabilityMinAnswered: number;
}

export const DEFAULT_OPERATING_THRESHOLDS: OperatingThresholds = {
  dispatchTimeoutMinutes: 120,
  shortNoticeTimeoutMinutes: 30,
  shortNoticeWindowHours: 48,
  amberPercent: 75,
  paymentWindowHours: 48,
  refundSingleUpTo: 500,
  refundDualUpTo: 2000,
  credentialExpiryWindowDays: 30,
  advisoryDualApprovalFrom: 'CRITICAL',
  retentionTriggerMonths: 6,
  retentionGraceDays: 30,
  resourcesStaleDays: 7,
  reliabilityFloorPercent: 85,
  reliabilityMinAnswered: 5,
};

export const OPERATING_THRESHOLD_KEYS = Object.keys(
  DEFAULT_OPERATING_THRESHOLDS,
) as (keyof OperatingThresholds)[];

export type ThresholdsIssue =
  'REFUND_DUAL_BELOW_SINGLE' | 'SHORT_NOTICE_NOT_SHORTER' | 'NOTHING_CHANGED';

/**
 * Why a proposed document cannot be applied, beyond each value's own bounds
 * (those are the schema's): the refund limits rise, the short-notice timer is
 * the shorter one, and a proposal changes something.
 */
export function thresholdsIssues(
  next: OperatingThresholds,
  current: OperatingThresholds,
): ThresholdsIssue[] {
  const issues: ThresholdsIssue[] = [];
  if (next.refundDualUpTo < next.refundSingleUpTo)
    issues.push('REFUND_DUAL_BELOW_SINGLE');
  if (next.shortNoticeTimeoutMinutes >= next.dispatchTimeoutMinutes) {
    issues.push('SHORT_NOTICE_NOT_SHORTER');
  }
  if (changedThresholds(current, next).length === 0) issues.push('NOTHING_CHANGED');
  return issues;
}

/** The keys whose value differs between two documents, in document order. */
export function changedThresholds(
  before: OperatingThresholds,
  after: OperatingThresholds,
): (keyof OperatingThresholds)[] {
  return OPERATING_THRESHOLD_KEYS.filter((key) => before[key] !== after[key]);
}

export const SETTINGS_VERSION_STATUSES = [
  'PROPOSED',
  'APPLIED',
  'REJECTED',
  'WITHDRAWN',
] as const;
export type SettingsVersionStatus = (typeof SETTINGS_VERSION_STATUSES)[number];

export type SettingsDecision = 'APPLY' | 'REJECT' | 'WITHDRAW';

export type SettingsDecisionRefusal =
  'NOT_PENDING' | 'ROLE' | 'OWN_PROPOSAL' | 'NOT_PROPOSER';

/**
 * Why this person cannot take this decision on a version, or null (D3). Only
 * a pending version is decided; a Super Admin other than the proposer applies
 * or rejects it; only the proposer withdraws it.
 */
export function settingsDecisionRefusal(
  version: { status: SettingsVersionStatus; proposedById: string | null },
  actor: { id: string; role: string },
  decision: SettingsDecision,
): SettingsDecisionRefusal | null {
  if (version.status !== 'PROPOSED') return 'NOT_PENDING';
  if (actor.role !== UserRole.SuperAdmin) return 'ROLE';
  if (decision === 'WITHDRAW') {
    return version.proposedById === actor.id ? null : 'NOT_PROPOSER';
  }
  return version.proposedById === actor.id ? 'OWN_PROPOSAL' : null;
}

const MINUTE_MS = 60 * 1000;

/** The dispatch timers as `resolveDispatchTimeoutMs` reads them. */
export function dispatchTimerPolicy(thresholds: OperatingThresholds): DispatchTimers {
  return {
    standardMs: thresholds.dispatchTimeoutMinutes * MINUTE_MS,
    shortNoticeMs: thresholds.shortNoticeTimeoutMinutes * MINUTE_MS,
    shortNoticeWindowMs: thresholds.shortNoticeWindowHours * 60 * MINUTE_MS,
  };
}
