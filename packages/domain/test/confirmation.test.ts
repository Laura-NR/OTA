import { describe, expect, it } from 'vitest';

import {
  hasConfirmation,
  preTripSteps,
  tripCalendar,
} from '../src/reservation/confirmation';
import { RESERVATION_STATUSES, ReservationStatus } from '../src/reservation/status';

const NOW = new Date('2026-12-01T12:00:00Z');
const BALANCE = { kind: 'BALANCE', amount: '800.00', dueAt: '2027-01-14T00:00:00.000Z' };

describe('hasConfirmation', () => {
  it('opens once a confirmed booking has received its first payment', () => {
    expect(hasConfirmation(ReservationStatus.Confirmed, 200)).toBe(true);
    expect(hasConfirmation(ReservationStatus.InProgress, 200)).toBe(true);
    expect(hasConfirmation(ReservationStatus.Completed, 200)).toBe(true);
  });

  it('stays closed for a booking confirmed by hand with nothing paid', () => {
    expect(hasConfirmation(ReservationStatus.Confirmed, 0)).toBe(false);
  });

  it('stays closed before confirmation and after a cancellation, paid or not', () => {
    const open = new Set<ReservationStatus>([
      ReservationStatus.Confirmed,
      ReservationStatus.InProgress,
      ReservationStatus.Completed,
    ]);
    for (const status of RESERVATION_STATUSES.filter((value) => !open.has(value))) {
      expect(hasConfirmation(status, 500)).toBe(false);
    }
  });
});

describe('preTripSteps', () => {
  it('puts a missing US certification before the payment and the entry rules', () => {
    const steps = preTripSteps({
      status: ReservationStatus.Confirmed,
      ofacMissing: 1,
      nextInstalment: BALANCE,
      now: NOW,
    });
    expect(steps.map((step) => step.kind)).toEqual(['CERTIFY', 'PAY', 'TRAVEL_INFO']);
    expect(steps[0]).toEqual({ kind: 'CERTIFY', missing: 1 });
    expect(steps[1]).toEqual({
      kind: 'PAY',
      instalmentKind: 'BALANCE',
      amount: '800.00',
      dueAt: BALANCE.dueAt,
      overdue: false,
    });
  });

  it('marks a balance past its due date as overdue', () => {
    const [step] = preTripSteps({
      status: ReservationStatus.Confirmed,
      ofacMissing: 0,
      nextInstalment: BALANCE,
      now: new Date('2027-01-15T00:00:00Z'),
    });
    expect(step).toMatchObject({ kind: 'PAY', overdue: true });
  });

  it('leaves only the entry rules once everything is paid and certified', () => {
    const steps = preTripSteps({
      status: ReservationStatus.Confirmed,
      ofacMissing: 0,
      nextInstalment: null,
      now: NOW,
    });
    expect(steps).toEqual([{ kind: 'TRAVEL_INFO' }]);
  });

  it('has nothing left to prepare once the trip has started or ended', () => {
    for (const status of [ReservationStatus.InProgress, ReservationStatus.Completed]) {
      expect(
        preTripSteps({ status, ofacMissing: 1, nextInstalment: BALANCE, now: NOW }),
      ).toEqual([]);
    }
  });
});

describe('tripCalendar', () => {
  const ics = tripCalendar({
    uid: 'VXPAY001@vereda-expeditions',
    title: 'Eco-Tourism in Viñales; booking VXPAY001',
    description: 'Booking VXPAY001, confirmed.\nDocuments: My trips',
    startDate: '2027-02-13T00:00:00.000Z',
    endDate: '2027-02-20T00:00:00.000Z',
    now: NOW,
  });
  const lines = ics.split('\r\n');

  it('is an all-day event whose exclusive end is the day after the last day', () => {
    expect(lines).toContain('DTSTART;VALUE=DATE:20270213');
    expect(lines).toContain('DTEND;VALUE=DATE:20270221');
    expect(lines).toContain('DTSTAMP:20261201T120000Z');
    expect(lines).toContain('UID:VXPAY001@vereda-expeditions');
  });

  it('escapes text values and ends every line with CRLF', () => {
    expect(lines).toContain('SUMMARY:Eco-Tourism in Viñales\\; booking VXPAY001');
    expect(ics).toContain(
      'DESCRIPTION:Booking VXPAY001\\, confirmed.\\nDocuments: My trips',
    );
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('folds a line longer than 75 octets onto continuation lines', () => {
    const long = tripCalendar({
      uid: 'X',
      title: 'Á'.repeat(60),
      description: '',
      startDate: '2027-02-13T00:00:00.000Z',
      endDate: '2027-02-13T00:00:00.000Z',
      now: NOW,
    });
    const encoder = new TextEncoder();
    const summary = long.split('\r\n').filter((line, index, all) => {
      const start = all.findIndex((candidate) => candidate.startsWith('SUMMARY:'));
      return index >= start && (index === start || line.startsWith(' '));
    });
    expect(summary.length).toBeGreaterThan(1);
    for (const line of summary) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(summary.map((line, index) => (index ? line.slice(1) : line)).join('')).toBe(
      `SUMMARY:${'Á'.repeat(60)}`,
    );
    // A one-day trip still ends the next day.
    expect(long).toContain('DTEND;VALUE=DATE:20270214');
  });
});
