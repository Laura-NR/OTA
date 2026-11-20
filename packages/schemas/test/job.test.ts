import { describe, expect, it } from 'vitest';

import {
  createIncidentSchema,
  recordJobStepSchema,
  reportEmergencySchema,
  serviceItemBriefSchema,
} from '../src';

describe('W-Job requests (docs/schema-w-job.md)', () => {
  it('clears a brief field sent empty and keeps one left out', () => {
    expect(
      serviceItemBriefSchema.parse({ meetingPoint: '  ', dropOff: 'Casa Lis' }),
    ).toEqual({
      meetingPoint: null,
      dropOff: 'Casa Lis',
    });
    expect(
      serviceItemBriefSchema.safeParse({ workerBrief: 'x'.repeat(501) }).success,
    ).toBe(false);
  });

  it('takes a step with a time that carries its offset', () => {
    expect(
      recordJobStepSchema.safeParse({
        step: 'ARRIVED',
        occurredAt: '2026-11-15T16:21:00-05:00',
      }).success,
    ).toBe(true);
    expect(
      recordJobStepSchema.safeParse({ step: 'ARRIVED', occurredAt: '16:21' }).success,
    ).toBe(false);
    expect(
      recordJobStepSchema.safeParse({
        step: 'PARKED',
        occurredAt: '2026-11-15T21:21:00Z',
      }).success,
    ).toBe(false);
  });

  it('takes a report with or without a position, never one off the globe', () => {
    const report = {
      category: 'MEDICAL',
      occurredAt: '2026-11-15T19:36:00Z',
      clientRef: '6f0b7c1e-2a4d-4f7e-9a51-1c2d3e4f5a6b',
    };
    expect(reportEmergencySchema.safeParse({ ...report, position: null }).success).toBe(
      true,
    );
    expect(
      reportEmergencySchema.safeParse({
        ...report,
        position: { latitude: 23.11, longitude: -82.36, accuracyM: 12 },
      }).success,
    ).toBe(true);
    expect(
      reportEmergencySchema.safeParse({
        ...report,
        position: { latitude: 123, longitude: -82.36, accuracyM: null },
      }).success,
    ).toBe(false);
    expect(reportEmergencySchema.safeParse({ ...report, category: 'FIRE' }).success).toBe(
      false,
    );
  });

  it('lets the desk log a report that came only by SMS, never one as the app', () => {
    const base = {
      category: 'MEDICAL',
      description: 'SOS por SMS',
      severity: 'CRITICAL',
    };
    expect(createIncidentSchema.parse(base).source).toBe('DESK');
    expect(createIncidentSchema.parse({ ...base, source: 'WORKER_SMS' }).source).toBe(
      'WORKER_SMS',
    );
    expect(
      createIncidentSchema.safeParse({ ...base, source: 'WORKER_APP' }).success,
    ).toBe(false);
  });
});
