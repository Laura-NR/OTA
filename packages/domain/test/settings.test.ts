import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OPERATING_THRESHOLDS,
  DEFAULT_RETENTION_POLICY,
  advisoryApprovalDecision,
  advisoryApprovalRefusal,
  canAutoDispatch,
  changedThresholds,
  dispatchTimerPolicy,
  emailDomainAllowed,
  escalationAlert,
  inviteAcceptRefusal,
  inviteConfirmRefusal,
  inviteState,
  isInvitePurgeDue,
  isResourcesStale,
  isRetentionPurgeDue,
  isRetentionReminderDue,
  isStaffSessionExpired,
  leavesNoSuperAdmin,
  resolveDispatchTimeoutMs,
  settingsDecisionRefusal,
  thresholdsIssues,
  type InviteFacts,
} from '../src';

const NOW = new Date('2026-10-23T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const defaults = DEFAULT_OPERATING_THRESHOLDS;

describe('operating thresholds (M9 D1–D3)', () => {
  it('defaults to the values the code ran on before M9', () => {
    expect(dispatchTimerPolicy(defaults)).toEqual({
      standardMs: 2 * HOUR,
      shortNoticeMs: 30 * 60_000,
      shortNoticeWindowMs: 48 * HOUR,
    });
    expect(DEFAULT_RETENTION_POLICY).toEqual({
      triggerMonths: defaults.retentionTriggerMonths,
      graceDays: defaults.retentionGraceDays,
    });
  });

  it('refuses refund limits that fall, a longer short-notice timer and no change', () => {
    expect(
      thresholdsIssues(
        { ...defaults, refundSingleUpTo: 900, refundDualUpTo: 800 },
        defaults,
      ),
    ).toContain('REFUND_DUAL_BELOW_SINGLE');
    expect(
      thresholdsIssues({ ...defaults, shortNoticeTimeoutMinutes: 120 }, defaults),
    ).toContain('SHORT_NOTICE_NOT_SHORTER');
    expect(thresholdsIssues(defaults, defaults)).toEqual(['NOTHING_CHANGED']);
    expect(thresholdsIssues({ ...defaults, amberPercent: 80 }, defaults)).toEqual([]);
  });

  it('lists what changed, for the approver', () => {
    expect(
      changedThresholds(defaults, {
        ...defaults,
        amberPercent: 80,
        refundDualUpTo: 2500,
      }),
    ).toEqual(['amberPercent', 'refundDualUpTo']);
  });

  it('lets a second Super Admin apply or reject, and only the proposer withdraw', () => {
    const pending = { status: 'PROPOSED' as const, proposedById: 'dayana' };
    const founder = { id: 'founder', role: 'SUPER_ADMIN' };
    const dayana = { id: 'dayana', role: 'SUPER_ADMIN' };
    expect(settingsDecisionRefusal(pending, founder, 'APPLY')).toBeNull();
    expect(settingsDecisionRefusal(pending, dayana, 'APPLY')).toBe('OWN_PROPOSAL');
    expect(settingsDecisionRefusal(pending, dayana, 'WITHDRAW')).toBeNull();
    expect(settingsDecisionRefusal(pending, founder, 'WITHDRAW')).toBe('NOT_PROPOSER');
    expect(
      settingsDecisionRefusal(pending, { id: 'ana', role: 'OPERATIONS_ADMIN' }, 'APPLY'),
    ).toBe('ROLE');
    expect(
      settingsDecisionRefusal({ ...pending, status: 'APPLIED' }, founder, 'APPLY'),
    ).toBe('NOT_PENDING');
  });
});

describe('the thresholds reach the rules that read them', () => {
  it('uses the timers and the amber share given', () => {
    const timers = dispatchTimerPolicy({ ...defaults, dispatchTimeoutMinutes: 90 });
    expect(
      resolveDispatchTimeoutMs({
        now: NOW,
        arrivalAt: new Date(NOW.getTime() + 10 * DAY),
        timers,
      }),
    ).toBe(90 * 60_000);
    const clock = {
      offeredAt: NOW,
      deadline: new Date(NOW.getTime() + 100_000),
      now: new Date(NOW.getTime() + 70_000),
    };
    expect(escalationAlert(clock)).toBe('NONE');
    expect(escalationAlert({ ...clock, amberThreshold: 0.6 })).toBe('AMBER');
  });

  it('uses the credential window and the staleness given', () => {
    const input = {
      verificationStatus: 'VERIFIED' as const,
      isAvailable: true,
      credentialExpiresAt: new Date(NOW.getTime() + 20 * DAY),
    };
    expect(canAutoDispatch(input, NOW)).toBe(false);
    expect(canAutoDispatch(input, NOW, 14)).toBe(true);
    expect(isResourcesStale(new Date(NOW.getTime() - 5 * DAY), NOW, 3)).toBe(true);
  });

  it('keeps the retention reminder a week before a changed deadline', () => {
    const clock = {
      latestCompletedAt: null,
      noticeSentAt: new Date(NOW.getTime() - 40 * DAY),
      consentGrantedAt: null,
      anonymizedAt: null,
    };
    const policy = { triggerMonths: 6, graceDays: 45 };
    expect(isRetentionPurgeDue(clock, NOW)).toBe(true);
    expect(isRetentionPurgeDue(clock, NOW, policy)).toBe(false);
    expect(isRetentionReminderDue(clock, NOW, policy)).toBe(true);
  });

  it('asks two approvals from CAUTION when the setting says so', () => {
    const ana = { approverId: 'ana', role: 'OPERATIONS_ADMIN' };
    expect(advisoryApprovalDecision('CAUTION', [ana]).state).toBe('PUBLISH');
    expect(advisoryApprovalDecision('CAUTION', [ana], 'CAUTION')).toEqual({
      state: 'PENDING',
      missing: ['SUPER_ADMIN'],
    });
    expect(
      advisoryApprovalRefusal(
        'CAUTION',
        [ana],
        { approverId: 'eli', role: 'OPERATIONS_ADMIN' },
        'CAUTION',
      ),
    ).toBe('ROLE_ALREADY_APPROVED');
  });
});

describe('staff invites and users (M9 D4, D5, D9)', () => {
  const invite = (overrides: Partial<InviteFacts & { email: string }> = {}) => ({
    email: 'yanet@vereda.travel',
    role: 'ADMINISTRATIVE_SUPPORT',
    invitedById: 'dayana',
    confirmedAt: null,
    expiresAt: new Date(NOW.getTime() + 7 * DAY),
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  });

  it('allows only the listed domains, or any when none is listed', () => {
    expect(emailDomainAllowed('Yanet@Vereda.travel', ['vereda.travel'])).toBe(true);
    expect(emailDomainAllowed('yanet@gmail.com', ['vereda.travel'])).toBe(false);
    expect(emailDomainAllowed('yanet@gmail.com', [])).toBe(true);
  });

  it('holds a Super Admin invite until a second Super Admin confirms it', () => {
    const superInvite = invite({ role: 'SUPER_ADMIN' });
    expect(inviteState(superInvite, NOW)).toBe('AWAITING_CONFIRMATION');
    expect(
      inviteConfirmRefusal(superInvite, { id: 'dayana', role: 'SUPER_ADMIN' }, NOW),
    ).toBe('OWN_INVITE');
    expect(
      inviteConfirmRefusal(superInvite, { id: 'founder', role: 'SUPER_ADMIN' }, NOW),
    ).toBeNull();
    expect(inviteAcceptRefusal(superInvite, 'yanet@vereda.travel', NOW)).toBe(
      'NEEDS_CONFIRMATION',
    );
    expect(inviteState(invite(), NOW)).toBe('SENT');
  });

  it('is accepted only by the invited address, while open', () => {
    expect(inviteAcceptRefusal(invite(), 'YANET@vereda.travel', NOW)).toBeNull();
    expect(inviteAcceptRefusal(invite(), 'other@vereda.travel', NOW)).toBe('WRONG_EMAIL');
    expect(
      inviteAcceptRefusal(
        invite({ expiresAt: new Date(NOW.getTime() - 1) }),
        'yanet@vereda.travel',
        NOW,
      ),
    ).toBe('NOT_OPEN');
    expect(
      inviteAcceptRefusal(invite({ revokedAt: NOW }), 'yanet@vereda.travel', NOW),
    ).toBe('NOT_OPEN');
  });

  it('deletes a closed invite 90 days after it closed', () => {
    const accepted = invite({ acceptedAt: new Date(NOW.getTime() - 91 * DAY) });
    expect(isInvitePurgeDue(accepted, NOW)).toBe(true);
    expect(
      isInvitePurgeDue(invite({ acceptedAt: new Date(NOW.getTime() - 10 * DAY) }), NOW),
    ).toBe(false);
    expect(isInvitePurgeDue(invite(), NOW)).toBe(false);
  });

  it('never leaves the desk without an active Super Admin', () => {
    expect(leavesNoSuperAdmin(['dayana'], 'dayana')).toBe(true);
    expect(leavesNoSuperAdmin(['dayana', 'founder'], 'dayana')).toBe(false);
  });

  it('ends a staff session 12 h after sign-in, never a traveler one', () => {
    const signedIn = new Date(NOW.getTime() - 13 * HOUR);
    expect(isStaffSessionExpired('OPERATIONS_ADMIN', signedIn, NOW)).toBe(true);
    expect(isStaffSessionExpired('TRAVELER', signedIn, NOW)).toBe(false);
    expect(
      isStaffSessionExpired('SUPER_ADMIN', new Date(NOW.getTime() - 11 * HOUR), NOW),
    ).toBe(false);
  });
});
