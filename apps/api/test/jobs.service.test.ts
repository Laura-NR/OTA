import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import type { EscalationPublisher } from '../src/escalation/escalation.publisher';
import { JobsService } from '../src/jobs/jobs.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const WORKER: AuthUser = {
  id: 'u-lazaro',
  email: 'driver@example.test',
  role: 'SERVICE_WORKER',
  sessionId: 'session-1',
};
const DESK: AuthUser = {
  id: 'u-ana',
  email: 'ops@example.test',
  role: 'OPERATIONS_ADMIN',
};
const NOW = new Date('2026-11-15T21:00:00Z');
const REF = '6f0b7c1e-2a4d-4f7e-9a51-1c2d3e4f5a6b';

interface FakeItem {
  id: string;
  supplierId: string | null;
  serviceType: string;
  status: string;
  respondedAt: Date | null;
  reservationId: string;
  enRouteAt: Date | null;
  arrivedAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  meetingPoint: string | null;
  dropOff: string | null;
  workerBrief: string | null;
  reservation: { status: string };
}

function job(overrides: Partial<FakeItem> = {}): FakeItem {
  return {
    id: 'item-1',
    supplierId: 'supplier-lazaro',
    serviceType: 'TRANSPORTATION',
    status: 'ACCEPTED',
    respondedAt: new Date('2026-11-10T12:00:00Z'),
    reservationId: 'booking-1',
    enRouteAt: null,
    arrivedAt: null,
    startedAt: null,
    finishedAt: null,
    meetingPoint: null,
    dropOff: null,
    workerBrief: null,
    reservation: { status: 'CONFIRMED' },
    ...overrides,
  };
}

function service(item: FakeItem | null, incidents: Array<Record<string, unknown>> = []) {
  const audits: Array<{ action: string; metadata: Record<string, unknown> }> = [];
  const published: Array<{ type: string; incidentId?: string }> = [];
  const prisma = {
    supplierProfile: {
      findUnique: async () => ({ id: 'supplier-lazaro' }),
    },
    serviceItem: {
      findUnique: async () => item,
      findUniqueOrThrow: async () => item,
      updateMany: async (args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const [column] = Object.keys(args.where).filter((key) => key !== 'id');
        if (!item || item[column as keyof FakeItem] !== null) return { count: 0 };
        Object.assign(item, args.data);
        return { count: 1 };
      },
      update: async (args: { data: Partial<FakeItem> }) => {
        Object.assign(item!, args.data);
        return {
          meetingPoint: item!.meetingPoint,
          dropOff: item!.dropOff,
          workerBrief: item!.workerBrief,
        };
      },
    },
    incident: {
      findUnique: async (args: { where: { clientRef: string } }) =>
        incidents.find((row) => row.clientRef === args.where.clientRef) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        const row = {
          id: `incident-${incidents.length + 1}`,
          createdAt: NOW,
          ...args.data,
        };
        incidents.push(row);
        return { id: row.id, createdAt: row.createdAt };
      },
    },
    auditLog: {
      create: async (args: {
        data: { action: string; metadata: Record<string, unknown> };
      }) => {
        audits.push(args.data);
        return {};
      },
    },
  };
  const publisher: EscalationPublisher = {
    publish: (event) => published.push(event as { type: string; incidentId?: string }),
  };
  return {
    jobs: new JobsService(prisma as unknown as PrismaService, publisher),
    audits,
    published,
    incidents,
  };
}

describe("a job's steps (docs/schema-w-job.md J2, J3)", () => {
  it("records the worker's step once, with the channel in the audit", async () => {
    const item = job();
    const { jobs, audits } = service(item);
    const step = { step: 'EN_ROUTE' as const, occurredAt: '2026-11-15T20:28:00Z' };

    const first = await jobs.workerStep(WORKER, 'item-1', step, NOW);
    const again = await jobs.workerStep(
      WORKER,
      'item-1',
      { ...step, occurredAt: '2026-11-15T20:40:00Z' },
      NOW,
    );

    expect(first.EN_ROUTE).toBe('2026-11-15T20:28:00.000Z');
    expect(again.EN_ROUTE).toBe('2026-11-15T20:28:00.000Z');
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'service_item.step_recorded',
      metadata: { step: 'EN_ROUTE', via: 'app', reservationId: 'booking-1' },
    });
  });

  it('finishes the job on the last step without touching the booking', async () => {
    const item = job({ arrivedAt: new Date('2026-11-15T20:00:00Z') });
    const { jobs } = service(item);
    await jobs.workerStep(
      WORKER,
      'item-1',
      { step: 'FINISHED', occurredAt: '2026-11-15T20:55:00Z' },
      NOW,
    );
    expect(item.status).toBe('FULFILLED');
    expect(item.reservation.status).toBe('CONFIRMED');
  });

  it('refuses going back, a time ahead of the clock, and a booking not under way', async () => {
    await expect(
      service(job({ arrivedAt: NOW })).jobs.workerStep(
        WORKER,
        'item-1',
        { step: 'EN_ROUTE', occurredAt: '2026-11-15T20:00:00Z' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service(job()).jobs.workerStep(
        WORKER,
        'item-1',
        { step: 'EN_ROUTE', occurredAt: '2026-11-15T21:30:00Z' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      service(job({ reservation: { status: 'PENDING_PAYMENT' } })).jobs.workerStep(
        WORKER,
        'item-1',
        { step: 'EN_ROUTE', occurredAt: '2026-11-15T20:00:00Z' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a step on another worker's job as not found", async () => {
    await expect(
      service(job({ supplierId: 'supplier-other' })).jobs.workerStep(
        WORKER,
        'item-1',
        { step: 'EN_ROUTE', occurredAt: '2026-11-15T20:00:00Z' },
        NOW,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lets the desk record a step after a call, audited as the desk's", async () => {
    const { jobs, audits } = service(job());
    await jobs.deskStep(
      DESK,
      'item-1',
      { step: 'ARRIVED', occurredAt: '2026-11-15T20:21:00Z' },
      NOW,
    );
    expect(audits[0]!.metadata.via).toBe('desk');
  });
});

describe('the on-site emergency (J5, J6)', () => {
  const report = {
    category: 'MEDICAL' as const,
    occurredAt: '2026-11-15T20:36:00Z',
    clientRef: REF,
    position: { latitude: 23.113612, longitude: -82.366581, accuracyM: 12.4 },
  };

  it("logs a critical report from the app and raises the desk's alert", async () => {
    const { jobs, incidents, published, audits } = service(job());
    const result = await jobs.reportEmergency(WORKER, 'item-1', report, NOW);

    expect(incidents[0]).toMatchObject({
      reservationId: 'booking-1',
      serviceItemId: 'item-1',
      supplierId: 'supplier-lazaro',
      category: 'MEDICAL',
      severity: 'CRITICAL',
      source: 'WORKER_APP',
      latitude: 23.113612,
      longitude: -82.366581,
      locationAccuracyM: 12,
      clientRef: REF,
    });
    expect(published).toEqual([
      expect.objectContaining({
        type: 'incident.emergency',
        incidentId: result.incidentId,
      }),
    ]);
    expect(audits[0]).toMatchObject({
      action: 'incident.reported',
      metadata: { hasPosition: true },
    });
  });

  it('returns the first report when the queue sends it again', async () => {
    const { jobs, incidents, published } = service(job());
    const first = await jobs.reportEmergency(WORKER, 'item-1', report, NOW);
    const again = await jobs.reportEmergency(WORKER, 'item-1', report, NOW);
    expect(again).toEqual(first);
    expect(incidents).toHaveLength(1);
    expect(published).toHaveLength(1);
  });

  it('refuses a report id another worker used', async () => {
    const { jobs } = service(job(), [
      { id: 'incident-x', createdAt: NOW, supplierId: 'supplier-other', clientRef: REF },
    ]);
    await expect(
      jobs.reportEmergency(WORKER, 'item-1', report, NOW),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("takes the API's time when the phone's clock runs ahead", async () => {
    const { jobs, incidents } = service(job());
    await jobs.reportEmergency(
      WORKER,
      'item-1',
      { ...report, occurredAt: '2026-11-15T23:00:00Z', position: null },
      NOW,
    );
    expect(incidents[0]).toMatchObject({
      occurredAt: NOW,
      latitude: null,
      longitude: null,
    });
  });
});

describe("the desk's brief (J1)", () => {
  it('keeps a field left out, clears one sent empty, and audits field names only', async () => {
    const item = job({ meetingPoint: 'T3', workerBrief: 'Ingrid lleva bastón' });
    const { jobs, audits } = service(item);
    const brief = await jobs.updateBrief(DESK, 'item-1', {
      dropOff: 'Casa Lis',
      workerBrief: null,
    });
    expect(brief).toEqual({ meetingPoint: 'T3', dropOff: 'Casa Lis', workerBrief: null });
    expect(audits[0]).toMatchObject({
      action: 'service_item.brief_updated',
      metadata: { fields: ['dropOff', 'workerBrief'] },
    });
    expect(JSON.stringify(audits)).not.toMatch(/bastón|Casa Lis/);
  });
});
