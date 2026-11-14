import { describe, expect, it } from 'vitest';

import {
  OPS_LITE_OPEN_STATES,
  OPS_LITE_STATES,
  compareInboxThreads,
  isUrgentThread,
  matchesInboxFilter,
  onTheGround,
  pipelineClock,
  provinceToday,
  redAlertCards,
  todaysMovements,
  type InboxThreadInput,
  type PipelineClockInput,
} from '../src';

/** 10:00 in Havana (UTC−5 in November). */
const NOW = new Date('2026-11-14T15:00:00Z');
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const MINUTE = 60_000;

function booking(overrides: Partial<PipelineClockInput> = {}): PipelineClockInput {
  return {
    status: 'ITINERARY_SUBMITTED',
    createdAt: new Date(NOW.getTime() - 22 * 60 * MINUTE),
    updatedAt: new Date(NOW.getTime() - 5 * MINUTE),
    startDate: day('2026-11-20'),
    endDate: day('2026-11-27'),
    offerDeadline: null,
    dueAt: null,
    ...overrides,
  };
}

describe('AL-Pipeline states', () => {
  it('lists the §4.2 states without the draft, and counts six as in pipeline', () => {
    expect(OPS_LITE_STATES).not.toContain('DRAFT');
    expect(OPS_LITE_STATES).toHaveLength(10);
    expect(OPS_LITE_OPEN_STATES).toEqual([
      'ITINERARY_SUBMITTED',
      'DISPATCH_IN_PROGRESS',
      'ASSEMBLY_AND_ESCALATION',
      'ACTION_REQUIRED',
      'SECURED_AND_INVOICED',
      'PENDING_PAYMENT',
    ]);
  });
});

describe('pipelineClock', () => {
  it('counts a request from its submission', () => {
    expect(pipelineClock(booking(), NOW)).toEqual({
      kind: 'waiting',
      ms: 22 * 60 * MINUTE,
      tone: 'default',
    });
  });

  it('counts dispatch down to the soonest offer deadline, amber during assembly', () => {
    const offerDeadline = new Date(NOW.getTime() + 98 * MINUTE);
    expect(
      pipelineClock(booking({ status: 'DISPATCH_IN_PROGRESS', offerDeadline }), NOW),
    ).toEqual({ kind: 'left', ms: 98 * MINUTE, tone: 'default' });
    expect(
      pipelineClock(booking({ status: 'ASSEMBLY_AND_ESCALATION', offerDeadline }), NOW),
    ).toEqual({ kind: 'left', ms: 98 * MINUTE, tone: 'warning' });
  });

  it('reads a passed deadline as expired, in red', () => {
    const offerDeadline = new Date(NOW.getTime() - MINUTE);
    expect(
      pipelineClock(booking({ status: 'ASSEMBLY_AND_ESCALATION', offerDeadline }), NOW),
    ).toEqual({ kind: 'expired', tone: 'error' });
    expect(
      pipelineClock(booking({ status: 'PENDING_PAYMENT', dueAt: offerDeadline }), NOW),
    ).toEqual({ kind: 'expired', tone: 'error' });
  });

  it('counts how long the desk has left a booking that needs action, in red', () => {
    expect(pipelineClock(booking({ status: 'ACTION_REQUIRED' }), NOW)).toEqual({
      kind: 'waiting',
      ms: 5 * MINUTE,
      tone: 'error',
    });
  });

  it('gives a confirmed trip the days to its start, green on the day', () => {
    expect(pipelineClock(booking({ status: 'CONFIRMED' }), NOW)).toEqual({
      kind: 'starts',
      days: 6,
      tone: 'default',
    });
    expect(
      pipelineClock(booking({ status: 'CONFIRMED', startDate: day('2026-11-14') }), NOW),
    ).toEqual({ kind: 'starts', days: 0, tone: 'success' });
  });

  it('numbers the days of a trip under way from 1, by Havana’s calendar', () => {
    const running = booking({ status: 'IN_PROGRESS', startDate: day('2026-11-12') });
    expect(pipelineClock(running, NOW)).toEqual({ kind: 'day', day: 3, tone: 'info' });
    // 03:00 UTC on the 15th is still the 14th in Havana.
    expect(pipelineClock(running, new Date('2026-11-15T03:00:00Z'))).toEqual({
      kind: 'day',
      day: 3,
      tone: 'info',
    });
  });

  it('dates a completed trip by its end and a cancelled booking by its change', () => {
    expect(pipelineClock(booking({ status: 'COMPLETED' }), NOW)).toEqual({
      kind: 'date',
      date: day('2026-11-27'),
      tone: 'muted',
    });
    const updatedAt = new Date('2026-10-02T12:00:00Z');
    expect(pipelineClock(booking({ status: 'CANCELLED', updatedAt }), NOW)).toEqual({
      kind: 'date',
      date: updatedAt,
      tone: 'muted',
    });
  });
});

describe('provinceToday', () => {
  const at = (iso: string) => new Date(iso);
  const services = [
    {
      serviceType: 'TRANSPORTATION',
      province: 'La Habana',
      serviceDateStart: at('2026-11-12T14:00:00Z'),
      serviceDateEnd: at('2026-11-12T16:00:00Z'),
    },
    {
      serviceType: 'ACCOMMODATION',
      province: 'La Habana',
      serviceDateStart: at('2026-11-12T19:00:00Z'),
      serviceDateEnd: at('2026-11-14T16:00:00Z'),
    },
    {
      serviceType: 'ACCOMMODATION',
      province: 'Pinar del Río',
      serviceDateStart: at('2026-11-14T20:00:00Z'),
      serviceDateEnd: at('2026-11-17T16:00:00Z'),
    },
  ];

  it('places the trip where the travelers sleep tonight', () => {
    expect(provinceToday(services, NOW)).toBe('Pinar del Río');
  });

  it('falls back to the last service started when nothing covers today', () => {
    expect(provinceToday(services.slice(0, 2), new Date('2026-11-16T15:00:00Z'))).toBe(
      'La Habana',
    );
  });

  it('is null when no service names a province', () => {
    expect(provinceToday([{ ...services[0]!, province: null }], NOW)).toBeNull();
  });
});

describe('onTheGround', () => {
  it('sums the parties by province, most travelers first, flagging open cases', () => {
    const ground = onTheGround(
      [
        { partySize: 2, province: 'La Habana' },
        { partySize: 3, province: 'CU03' },
        { partySize: 2, province: 'Pinar del Río' },
        { partySize: 1, province: null },
      ],
      [{ province: 'CU01', scenario: 'outage' }],
    );
    expect(ground.bookings).toBe(4);
    expect(ground.travelers).toBe(8);
    expect(ground.provinces).toEqual([
      { province: 'CU03', travelers: 5, scenario: null },
      { province: 'CU01', travelers: 2, scenario: 'outage' },
    ]);
  });

  it('counts a party of at least one', () => {
    expect(onTheGround([{ partySize: 0, province: null }], []).travelers).toBe(1);
  });
});

describe('todaysMovements', () => {
  const base = {
    startDate: day('2026-11-20'),
    endDate: day('2026-11-27'),
    dueAt: null,
  };

  it('lists today’s payment deadlines by time, then arrivals, then departures', () => {
    const movements = todaysMovements(
      [
        {
          ...base,
          reservationId: 'leaving',
          status: 'IN_PROGRESS',
          endDate: day('2026-11-14'),
        },
        {
          ...base,
          reservationId: 'arriving',
          status: 'CONFIRMED',
          startDate: day('2026-11-14'),
        },
        {
          ...base,
          reservationId: 'late',
          status: 'PENDING_PAYMENT',
          dueAt: new Date('2026-11-14T22:00:00Z'),
        },
        {
          ...base,
          reservationId: 'early',
          status: 'PENDING_PAYMENT',
          dueAt: new Date('2026-11-14T16:00:00Z'),
        },
      ],
      NOW,
    );
    expect(movements.map((movement) => [movement.reservationId, movement.kind])).toEqual([
      ['early', 'PAYMENT_DUE'],
      ['late', 'PAYMENT_DUE'],
      ['arriving', 'ARRIVAL'],
      ['leaving', 'DEPARTURE'],
    ]);
  });

  it('leaves out bookings that are not live and deadlines on another Havana day', () => {
    expect(
      todaysMovements(
        [
          {
            ...base,
            reservationId: 'cancelled',
            status: 'CANCELLED',
            startDate: day('2026-11-14'),
          },
          {
            ...base,
            reservationId: 'tomorrow',
            status: 'PENDING_PAYMENT',
            // 01:00 on the 15th in Havana.
            dueAt: new Date('2026-11-15T06:00:00Z'),
          },
        ],
        NOW,
      ),
    ).toEqual([]);
  });
});

describe('AL-Inbox threads', () => {
  function thread(overrides: Partial<InboxThreadInput> = {}): InboxThreadInput {
    return {
      lastSender: 'TRAVELER',
      lastAt: new Date('2026-11-14T14:00:00Z'),
      unread: 0,
      openDisruption: false,
      ...overrides,
    };
  }

  it('is urgent only while a traveler on an open case waits for a reply', () => {
    expect(isUrgentThread(thread({ openDisruption: true }))).toBe(true);
    expect(
      isUrgentThread(thread({ openDisruption: true, lastSender: 'OPERATIONS' })),
    ).toBe(false);
    expect(isUrgentThread(thread())).toBe(false);
  });

  it('filters by urgency and by unread messages', () => {
    const unread = thread({ unread: 2 });
    expect(matchesInboxFilter(unread, 'unread')).toBe(true);
    expect(matchesInboxFilter(unread, 'urgent')).toBe(false);
    expect(matchesInboxFilter(thread(), 'unread')).toBe(false);
    expect(matchesInboxFilter(thread(), 'all')).toBe(true);
  });

  it('orders urgent, then unread, then the latest message first', () => {
    const newest = thread({ lastAt: new Date('2026-11-14T14:30:00Z') });
    const unread = thread({ unread: 1, lastAt: new Date('2026-11-14T09:00:00Z') });
    const urgent = thread({
      openDisruption: true,
      lastAt: new Date('2026-11-13T09:00:00Z'),
    });
    const older = thread({ lastAt: new Date('2026-11-14T08:00:00Z') });
    expect([older, newest, unread, urgent].sort(compareInboxThreads)).toEqual([
      urgent,
      unread,
      newest,
      older,
    ]);
  });
});

describe('redAlertCards', () => {
  it('gives each booking one card, led by its oldest red item, oldest booking first', () => {
    const at = (minutes: number) => new Date(NOW.getTime() - minutes * MINUTE);
    const stay = { bookingId: 'b1', id: 'stay', since: at(30) };
    const guide = { bookingId: 'b1', id: 'guide', since: at(90) };
    const driver = { bookingId: 'b2', id: 'driver', since: at(60) };
    const unknown = { bookingId: 'b3', id: 'unknown', since: null };
    expect(redAlertCards([stay, unknown, driver, guide])).toEqual([
      { bookingId: 'b1', lead: guide, others: [stay] },
      { bookingId: 'b2', lead: driver, others: [] },
      { bookingId: 'b3', lead: unknown, others: [] },
    ]);
  });
});
