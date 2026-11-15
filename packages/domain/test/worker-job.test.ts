import { describe, expect, it } from 'vitest';

import {
  JOB_STEPS,
  currentJobStep,
  emergencySms,
  finishesJob,
  fitsOneSmsSegment,
  jobNightHost,
  jobStepRefusal,
  jobStepsFor,
  jobStepsOpen,
  queueJobAction,
  type JobStepTimes,
} from '../src';

const NONE: JobStepTimes = {
  EN_ROUTE: null,
  ARRIVED: null,
  STARTED: null,
  FINISHED: null,
};
const NOW = new Date('2026-11-15T19:00:00.000Z');
const ACCEPTED = new Date('2026-11-14T12:00:00.000Z');

describe('the steps of a job (docs/schema-w-job.md J2, J3)', () => {
  it('gives a host only the guests arriving and leaving', () => {
    expect(jobStepsFor('TRANSPORTATION')).toEqual(JOB_STEPS);
    expect(jobStepsFor('GUIDE')).toEqual(JOB_STEPS);
    expect(jobStepsFor('ACCOMMODATION')).toEqual(['STARTED', 'FINISHED']);
  });

  it('reads the latest step recorded, even with one skipped', () => {
    expect(currentJobStep(NONE)).toBeNull();
    expect(currentJobStep({ ...NONE, ARRIVED: NOW })).toBe('ARRIVED');
    expect(currentJobStep({ ...NONE, EN_ROUTE: NOW, STARTED: NOW })).toBe('STARTED');
  });

  it('records a step in order, and lets the worker skip one', () => {
    const base = {
      serviceType: 'TRANSPORTATION' as const,
      now: NOW,
      acceptedAt: ACCEPTED,
    };
    expect(
      jobStepRefusal({ ...base, step: 'EN_ROUTE', at: NOW, times: NONE }),
    ).toBeNull();
    expect(jobStepRefusal({ ...base, step: 'ARRIVED', at: NOW, times: NONE })).toBeNull();
  });

  it('never moves back once a later step is in', () => {
    expect(
      jobStepRefusal({
        step: 'EN_ROUTE',
        serviceType: 'TRANSPORTATION',
        at: NOW,
        now: NOW,
        acceptedAt: ACCEPTED,
        times: { ...NONE, ARRIVED: NOW },
      }),
    ).toBe('later_step_recorded');
  });

  it('does not refuse a step sent again, so a resent tap is harmless', () => {
    expect(
      jobStepRefusal({
        step: 'ARRIVED',
        serviceType: 'TRANSPORTATION',
        at: NOW,
        now: NOW,
        acceptedAt: ACCEPTED,
        times: { ...NONE, ARRIVED: NOW, STARTED: NOW },
      }),
    ).toBeNull();
  });

  it('refuses a time ahead of the API clock or before the job was accepted', () => {
    const base = {
      step: 'EN_ROUTE' as const,
      serviceType: 'GUIDE' as const,
      now: NOW,
      acceptedAt: ACCEPTED,
      times: NONE,
    };
    expect(jobStepRefusal({ ...base, at: new Date(NOW.getTime() + 60_000) })).toBeNull();
    expect(jobStepRefusal({ ...base, at: new Date(NOW.getTime() + 5 * 60_000) })).toBe(
      'in_future',
    );
    expect(jobStepRefusal({ ...base, at: new Date('2026-11-14T11:00:00.000Z') })).toBe(
      'before_acceptance',
    );
  });

  it('refuses a step the service type does not use', () => {
    expect(
      jobStepRefusal({
        step: 'EN_ROUTE',
        serviceType: 'ACCOMMODATION',
        at: NOW,
        now: NOW,
        acceptedAt: ACCEPTED,
        times: NONE,
      }),
    ).toBe('not_for_type');
  });

  it('takes steps only on a paid booking that is not over', () => {
    expect(['CONFIRMED', 'IN_PROGRESS'].every(jobStepsOpen)).toBe(true);
    expect(
      ['SECURED_AND_INVOICED', 'PENDING_PAYMENT', 'COMPLETED', 'CANCELLED'].some(
        jobStepsOpen,
      ),
    ).toBe(false);
  });

  it('finishes the job only on the last step', () => {
    expect(JOB_STEPS.filter(finishesJob)).toEqual(['FINISHED']);
  });
});

describe('the on-site emergency SMS (J6)', () => {
  const at = new Date('2026-11-15T19:36:00.000Z'); // 14:36 in Havana

  it('carries the booking, the type, the position, Havana time and the name', () => {
    const text = emergencySms({
      bookingCode: 'VX-4R8T',
      category: 'MEDICAL',
      position: { latitude: 23.113612, longitude: -82.366581, accuracyM: 12.4 },
      at,
      workerFirstName: 'Lázaro',
    });
    expect(text).toBe('SOS VX-4R8T MEDICA 23.11361,-82.36658 (12 m) 14:36 Lazaro');
    expect(fitsOneSmsSegment(text)).toBe(true);
  });

  it('says so when there is no position', () => {
    expect(
      emergencySms({
        bookingCode: 'VX-4R8T',
        category: 'SECURITY',
        position: null,
        at,
        workerFirstName: null,
      }),
    ).toBe('SOS VX-4R8T SEGURIDAD sin ubicacion 14:36');
  });

  it('cuts the name rather than spill into a second segment', () => {
    const text = emergencySms({
      bookingCode: 'VX-4R8T',
      category: 'MECHANICAL',
      position: { latitude: 23.1, longitude: -82.3, accuracyM: null },
      at,
      workerFirstName: 'Ñ'.repeat(10) + 'a'.repeat(200),
    });
    expect(fitsOneSmsSegment(text)).toBe(true);
    expect(text.startsWith('SOS VX-4R8T MECANICA 23.10000,-82.30000 14:36 ')).toBe(true);
  });
});

describe('the local contact on a job (J8)', () => {
  const stay = {
    startsAt: new Date('2026-11-15T00:00:00.000Z'),
    endsAt: new Date('2026-11-17T00:00:00.000Z'),
    hostFirstName: 'Lis',
    hostPhone: '5 241 33 88',
  };

  it('gives the host of the night the job starts, with a Cuban phone', () => {
    expect(jobNightHost(new Date('2026-11-15T20:50:00.000Z'), [stay])).toEqual({
      firstName: 'Lis',
      phone: '+5352413388',
    });
  });

  it('reads a date-only job as its calendar day', () => {
    expect(jobNightHost(new Date('2026-11-16T00:00:00.000Z'), [stay])?.firstName).toBe(
      'Lis',
    );
  });

  it('gives no one on the morning the guests leave or before they arrive', () => {
    expect(jobNightHost(new Date('2026-11-17T14:00:00.000Z'), [stay])).toBeNull();
    expect(jobNightHost(new Date('2026-11-14T14:00:00.000Z'), [stay])).toBeNull();
  });

  it('never gives a foreign or missing phone', () => {
    const at = new Date('2026-11-15T20:50:00.000Z');
    expect(jobNightHost(at, [{ ...stay, hostPhone: '+34 600 123 456' }])).toBeNull();
    expect(jobNightHost(at, [{ ...stay, hostPhone: null }])).toBeNull();
  });
});

describe('the job actions waiting on the phone (spec §7.2)', () => {
  const step = (serviceItemId: string, name: 'EN_ROUTE' | 'ARRIVED', at: string) =>
    ({ kind: 'step', serviceItemId, step: name, occurredAt: at }) as const;
  const report = {
    kind: 'emergency',
    serviceItemId: 'a',
    clientRef: 'ref-1',
    category: 'MEDICAL',
    occurredAt: '2026-11-15T19:36:00Z',
    position: null,
  } as const;

  it('keeps steps in the order tapped, and the first tap of a step', () => {
    let queue = queueJobAction([], step('a', 'EN_ROUTE', '2026-11-15T19:00:00Z'));
    queue = queueJobAction(queue, step('a', 'ARRIVED', '2026-11-15T19:20:00Z'));
    queue = queueJobAction(queue, step('a', 'EN_ROUTE', '2026-11-15T19:30:00Z'));
    expect(queue.map((action) => action.kind === 'step' && action.occurredAt)).toEqual([
      '2026-11-15T19:00:00Z',
      '2026-11-15T19:20:00Z',
    ]);
    expect(queue.every((action) => action.attempts === 0)).toBe(true);
  });

  it('puts an emergency report ahead of every waiting step', () => {
    let queue = queueJobAction([], step('a', 'EN_ROUTE', '2026-11-15T19:00:00Z'));
    queue = queueJobAction(queue, report);
    queue = queueJobAction(queue, { ...report, clientRef: 'ref-2' });
    expect(
      queue.map((action) => (action.kind === 'step' ? action.step : action.clientRef)),
    ).toEqual(['ref-1', 'ref-2', 'EN_ROUTE']);
  });
});
