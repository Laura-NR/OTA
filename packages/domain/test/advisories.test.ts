import { describe, expect, it } from 'vitest';

import {
  advisoryApprovalDecision,
  advisoryApprovalRefusal,
  advisoryCoversProvinces,
  advisoryDisplayStatus,
  advisoryMissingTranslations,
  advisoryReachesBooking,
  advisoryRecipients,
  advisoryReference,
  advisoryVersionReference,
  advisoryWindowIssue,
  compareAdvisories,
  cubaProvinceCode,
  isAdvisoryActive,
  pickAdvisoryTranslation,
  type AdvisoryBooking,
  type AdvisoryReach,
} from '../src';

const OPS = { approverId: 'ana', role: 'OPERATIONS_ADMIN' };
const OPS_2 = { approverId: 'ernesto', role: 'OPERATIONS_ADMIN' };
const SUPER = { approverId: 'dayana', role: 'SUPER_ADMIN' };
const SUPPORT = { approverId: 'luis', role: 'ADMINISTRATIVE_SUPPORT' };

describe('advisory approvals', () => {
  it('publishes info and caution on one operations or super admin approval', () => {
    expect(advisoryApprovalDecision('INFO', [OPS])).toEqual({ state: 'PUBLISH' });
    expect(advisoryApprovalDecision('CAUTION', [SUPER])).toEqual({ state: 'PUBLISH' });
    expect(advisoryApprovalDecision('CAUTION', [])).toEqual({
      state: 'PENDING',
      missing: ['APPROVER'],
    });
  });

  it('never counts a support approval', () => {
    expect(advisoryApprovalDecision('INFO', [SUPPORT])).toEqual({
      state: 'PENDING',
      missing: ['APPROVER'],
    });
  });

  it('holds a critical advisory until an operations admin and a super admin approve', () => {
    expect(advisoryApprovalDecision('CRITICAL', [OPS])).toEqual({
      state: 'PENDING',
      missing: ['SUPER_ADMIN'],
    });
    expect(advisoryApprovalDecision('CRITICAL', [SUPER])).toEqual({
      state: 'PENDING',
      missing: ['OPERATIONS_ADMIN'],
    });
    expect(advisoryApprovalDecision('CRITICAL', [OPS, OPS_2])).toEqual({
      state: 'PENDING',
      missing: ['SUPER_ADMIN'],
    });
    expect(advisoryApprovalDecision('CRITICAL', [OPS, SUPER])).toEqual({
      state: 'PUBLISH',
    });
  });

  it('needs two different people for a critical advisory', () => {
    const same = [OPS, { approverId: 'ana', role: 'SUPER_ADMIN' }];
    expect(advisoryApprovalDecision('CRITICAL', same).state).toBe('PENDING');
  });

  it('refuses a support approval, a repeat, and a second vote of the same role on critical', () => {
    expect(advisoryApprovalRefusal('INFO', [], SUPPORT)).toBe('ROLE');
    expect(advisoryApprovalRefusal('CAUTION', [OPS], OPS)).toBe('ALREADY_APPROVED');
    expect(advisoryApprovalRefusal('CRITICAL', [OPS], OPS_2)).toBe(
      'ROLE_ALREADY_APPROVED',
    );
    expect(advisoryApprovalRefusal('CRITICAL', [OPS], SUPER)).toBeNull();
    expect(advisoryApprovalRefusal('CAUTION', [OPS], OPS_2)).toBeNull();
  });
});

describe('advisory status and window', () => {
  const from = new Date('2026-10-06T15:00:00Z');
  const to = new Date('2026-10-20T00:00:00Z');

  it('derives scheduled and expired from the window of a published advisory', () => {
    expect(
      advisoryDisplayStatus('PUBLISHED', from, to, new Date('2026-10-05T00:00:00Z')),
    ).toBe('SCHEDULED');
    expect(
      advisoryDisplayStatus('PUBLISHED', from, to, new Date('2026-10-10T00:00:00Z')),
    ).toBe('PUBLISHED');
    expect(advisoryDisplayStatus('PUBLISHED', from, to, to)).toBe('EXPIRED');
    expect(
      advisoryDisplayStatus('DRAFT', from, to, new Date('2026-11-01T00:00:00Z')),
    ).toBe('DRAFT');
    expect(
      advisoryDisplayStatus('LIFTED', from, to, new Date('2026-10-10T00:00:00Z')),
    ).toBe('LIFTED');
  });

  it('is active only while published inside its window', () => {
    expect(
      isAdvisoryActive('PUBLISHED', from, to, new Date('2026-10-10T00:00:00Z')),
    ).toBe(true);
    expect(isAdvisoryActive('LIFTED', from, to, new Date('2026-10-10T00:00:00Z'))).toBe(
      false,
    );
    expect(
      isAdvisoryActive('PUBLISHED', from, to, new Date('2026-10-01T00:00:00Z')),
    ).toBe(false);
  });

  it('requires an end after the start, and refuses an already expired window', () => {
    expect(advisoryWindowIssue(to, from, from)).toBe('EXPIRES_BEFORE_START');
    expect(advisoryWindowIssue(from, from, from)).toBe('EXPIRES_BEFORE_START');
    expect(advisoryWindowIssue(from, to, new Date('2026-10-21T00:00:00Z'))).toBe(
      'ALREADY_EXPIRED',
    );
    expect(advisoryWindowIssue(from, to, from)).toBeNull();
  });
});

describe('advisory regions and translations', () => {
  it('treats an empty region list as the whole country', () => {
    expect(advisoryCoversProvinces([], ['CU01'])).toBe(true);
    expect(advisoryCoversProvinces([], [])).toBe(true);
    expect(advisoryCoversProvinces(['CU01'], ['CU03', 'CU01'])).toBe(true);
    expect(advisoryCoversProvinces(['CU01'], ['CU03'])).toBe(false);
  });

  it('maps catalogue province names to codes', () => {
    expect(cubaProvinceCode('Pinar del Río')).toBe('CU01');
    expect(cubaProvinceCode('pinar del rio')).toBe('CU01');
    expect(cubaProvinceCode('CU03')).toBe('CU03');
    expect(cubaProvinceCode('Atlantis')).toBeNull();
  });

  it('needs every tenant locale for critical, the source locale otherwise', () => {
    expect(
      advisoryMissingTranslations('CAUTION', 'en', ['en'], ['es', 'en', 'fr']),
    ).toEqual([]);
    expect(advisoryMissingTranslations('INFO', 'en', ['es'], ['es', 'en', 'fr'])).toEqual(
      ['en'],
    );
    expect(
      advisoryMissingTranslations('CRITICAL', 'en', ['en', 'es'], ['es', 'en', 'fr']),
    ).toEqual(['fr']);
  });

  it('falls back to the source text in a missing language', () => {
    const translations = [
      { locale: 'en', headline: 'Fuel queues' },
      { locale: 'es', headline: 'Colas de combustible' },
    ];
    expect(pickAdvisoryTranslation(translations, 'es', 'en')?.headline).toBe(
      'Colas de combustible',
    );
    expect(pickAdvisoryTranslation(translations, 'fr', 'en')?.headline).toBe(
      'Fuel queues',
    );
    expect(pickAdvisoryTranslation([], 'fr', 'en')).toBeNull();
  });
});

describe('advisory audience', () => {
  const now = new Date('2026-10-06T15:00:00Z');
  const caution: AdvisoryReach = {
    severity: 'CAUTION',
    regions: ['CU01'],
    effectiveFrom: now,
    expiresAt: new Date('2027-02-28T00:00:00Z'),
    notifyTravelers: true,
  };
  const booking = (overrides: Partial<AdvisoryBooking> = {}): AdvisoryBooking => ({
    reservationId: 'r1',
    userId: 'u1',
    status: 'CONFIRMED',
    startDate: new Date('2026-11-13T00:00:00Z'),
    endDate: new Date('2026-11-20T00:00:00Z'),
    provinces: ['CU01'],
    ...overrides,
  });

  it('reaches a secured trip in the region starting within 60 days', () => {
    expect(advisoryReachesBooking(caution, booking(), now)).toBe(true);
    for (const status of ['SECURED_AND_INVOICED', 'PENDING_PAYMENT', 'IN_PROGRESS']) {
      expect(advisoryReachesBooking(caution, booking({ status }), now), status).toBe(
        true,
      );
    }
  });

  it('skips unsecured, finished or cancelled bookings', () => {
    for (const status of ['ITINERARY_SUBMITTED', 'COMPLETED', 'CANCELLED', 'DRAFT']) {
      expect(advisoryReachesBooking(caution, booking({ status }), now), status).toBe(
        false,
      );
    }
  });

  it('skips trips beyond 60 days, already over, or outside the advisory window', () => {
    const far = booking({
      startDate: new Date('2026-12-06T00:00:00Z'),
      endDate: new Date('2026-12-10T00:00:00Z'),
    });
    expect(advisoryReachesBooking(caution, far, now)).toBe(false);
    const over = booking({
      startDate: new Date('2026-09-28T00:00:00Z'),
      endDate: new Date('2026-10-05T00:00:00Z'),
    });
    expect(advisoryReachesBooking(caution, over, now)).toBe(false);
    const short = { ...caution, expiresAt: new Date('2026-11-01T00:00:00Z') };
    expect(advisoryReachesBooking(short, booking(), now)).toBe(false);
  });

  it('counts a trip on its last day as under way', () => {
    const lastDay = booking({
      status: 'IN_PROGRESS',
      startDate: new Date('2026-09-30T00:00:00Z'),
      endDate: new Date('2026-10-06T00:00:00Z'),
    });
    expect(advisoryReachesBooking(caution, lastDay, now)).toBe(true);
  });

  it('skips other regions, info advisories and advisories with email off', () => {
    expect(advisoryReachesBooking(caution, booking({ provinces: ['CU03'] }), now)).toBe(
      false,
    );
    expect(advisoryReachesBooking({ ...caution, severity: 'INFO' }, booking(), now)).toBe(
      false,
    );
    expect(
      advisoryReachesBooking({ ...caution, notifyTravelers: false }, booking(), now),
    ).toBe(false);
    expect(
      advisoryReachesBooking(
        { ...caution, regions: [] },
        booking({ provinces: [] }),
        now,
      ),
    ).toBe(true);
  });

  it('emails each traveler once, listing their reached bookings earliest first', () => {
    const recipients = advisoryRecipients(
      caution,
      [
        booking({ reservationId: 'late', startDate: new Date('2026-11-20T00:00:00Z') }),
        booking({ reservationId: 'early', startDate: new Date('2026-10-20T00:00:00Z') }),
        booking({ reservationId: 'other', userId: 'u2' }),
        booking({ reservationId: 'elsewhere', userId: 'u3', provinces: ['CU13'] }),
      ],
      now,
    );
    expect(recipients).toEqual([
      { userId: 'u1', reservationIds: ['early', 'late'] },
      { userId: 'u2', reservationIds: ['other'] },
    ]);
  });
});

describe('advisory references and order', () => {
  it('numbers a year’s advisories and their versions', () => {
    expect(advisoryReference(2026, 31)).toBe('ADV-2026-031');
    expect(advisoryReference(2026, 1204)).toBe('ADV-2026-1204');
    expect(advisoryVersionReference('ADV-2026-031')).toBe('ADV-2026-031-2');
    expect(advisoryVersionReference('ADV-2026-031-2')).toBe('ADV-2026-031-3');
  });

  it('puts the most severe first, then the most recent', () => {
    const older = new Date('2026-10-01T00:00:00Z');
    const newer = new Date('2026-10-05T00:00:00Z');
    const list = [
      { id: 'info', severity: 'INFO' as const, effectiveFrom: newer },
      { id: 'caution-old', severity: 'CAUTION' as const, effectiveFrom: older },
      { id: 'critical', severity: 'CRITICAL' as const, effectiveFrom: older },
      { id: 'caution-new', severity: 'CAUTION' as const, effectiveFrom: newer },
    ];
    expect([...list].sort(compareAdvisories).map((item) => item.id)).toEqual([
      'critical',
      'caution-new',
      'caution-old',
      'info',
    ]);
  });
});
