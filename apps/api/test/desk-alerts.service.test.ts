import type { ServiceItem } from '@ota/db';
import { ALERT_MUTE_MS, ServiceItemStatus } from '@ota/domain';
import { beforeEach, describe, expect, it } from 'vitest';

import type { AuthUser } from '../src/common/auth/auth-user';
import {
  ALERTS_MUTED,
  ALERTS_UNMUTED,
  DeskAlertsService,
} from '../src/dispatch/desk-alerts.service';
import { ALERT_ACKNOWLEDGED } from '../src/dispatch/alert-acknowledgements';
import type {
  DeskAlertEvent,
  EscalationEvent,
  EscalationPublisher,
} from '../src/escalation/escalation.publisher';
import type { PrismaService } from '../src/prisma/prisma.service';

const ITEM_ID = 'item-1';
const OFFERED_AT = new Date('2026-10-29T14:00:00Z');

const OPERATOR: AuthUser = {
  id: 'user-ops',
  email: 'ana@example.test',
  role: 'OPERATIONS_ADMIN',
};
const SECOND: AuthUser = {
  id: 'user-ops-2',
  email: 'luis@example.test',
  role: 'SUPER_ADMIN',
};
const NAMES: Record<string, string | null> = {
  'user-ops': 'Ana Rodríguez',
  'user-ops-2': null,
};

interface AuditRow {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

interface Store {
  items: ServiceItem[];
  audits: AuditRow[];
}

function makeItem(overrides: Partial<ServiceItem> = {}): ServiceItem {
  return {
    id: ITEM_ID,
    reservationId: 'res-1',
    supplierId: 'sup-1',
    serviceType: 'GUIDE',
    serviceDateStart: new Date('2026-11-02T09:00:00Z'),
    serviceDateEnd: new Date('2026-11-02T13:00:00Z'),
    province: 'Matanzas',
    status: ServiceItemStatus.Timeout,
    dispatchDeadline: new Date(OFFERED_AT.getTime() + 2 * 60 * 60 * 1000),
    offeredAt: OFFERED_AT,
    respondedAt: null,
    declineReason: null,
    payoutRate: '0' as unknown as ServiceItem['payoutRate'],
    payoutStatus: 'ACCRUED',
    createdAt: new Date('2026-10-20T10:00:00Z'),
    updatedAt: new Date('2026-10-20T10:00:00Z'),
    ...overrides,
  };
}

function withActor(row: AuditRow) {
  return {
    ...row,
    actor: row.actorUserId
      ? {
          fullName: NAMES[row.actorUserId] ?? null,
          email: `${row.actorUserId}@example.test`,
        }
      : null,
  };
}

function createFakePrisma(store: Store): PrismaService {
  const matches = (
    row: AuditRow,
    where: { action?: string | { in: string[] }; entityType?: string; entityId?: string },
  ) =>
    (where.action === undefined ||
      (typeof where.action === 'string'
        ? row.action === where.action
        : where.action.in.includes(row.action))) &&
    (where.entityType === undefined || row.entityType === where.entityType) &&
    (where.entityId === undefined || row.entityId === where.entityId);

  return {
    serviceItem: {
      findUnique: async (args: { where: { id: string } }) =>
        store.items.find((item) => item.id === args.where.id) ?? null,
    },
    auditLog: {
      findMany: async (args: { where: Parameters<typeof matches>[1] }) =>
        store.audits.filter((row) => matches(row, args.where)).map(withActor),
      findFirst: async (args: { where: Parameters<typeof matches>[1] }) => {
        const rows = store.audits
          .filter((row) => matches(row, args.where))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return rows[0] ? withActor(rows[0]) : null;
      },
      create: async (args: { data: Partial<AuditRow> & { action: string } }) => {
        const row: AuditRow = {
          actorUserId: args.data.actorUserId ?? null,
          action: args.data.action,
          entityType: args.data.entityType ?? '',
          entityId: args.data.entityId ?? null,
          metadata: (args.data.metadata as Record<string, unknown>) ?? null,
          createdAt: args.data.createdAt ?? new Date(),
        };
        store.audits.push(row);
        return withActor(row);
      },
    },
  } as unknown as PrismaService;
}

class FakePublisher implements EscalationPublisher {
  events: Array<EscalationEvent | DeskAlertEvent> = [];
  publish(event: EscalationEvent | DeskAlertEvent): void {
    this.events.push(event);
  }
}

describe('DeskAlertsService', () => {
  let store: Store;
  let publisher: FakePublisher;
  let service: DeskAlertsService;

  beforeEach(() => {
    store = { items: [makeItem()], audits: [] };
    publisher = new FakePublisher();
    service = new DeskAlertsService(createFakePrisma(store), publisher);
  });

  it('records a red alert acknowledged for the desk, with the offer it covers', async () => {
    const ack = await service.acknowledge(ITEM_ID, OFFERED_AT.toISOString(), OPERATOR);

    expect(ack.by).toBe('Ana Rodríguez');
    expect(store.audits).toEqual([
      expect.objectContaining({
        actorUserId: OPERATOR.id,
        action: ALERT_ACKNOWLEDGED,
        entityType: 'ServiceItem',
        entityId: ITEM_ID,
        metadata: expect.objectContaining({ offeredAt: OFFERED_AT.toISOString() }),
      }),
    ]);
    expect(publisher.events).toEqual([
      expect.objectContaining({ type: 'alert.acknowledged', serviceItemId: ITEM_ID }),
    ]);
  });

  it('keeps the first acknowledgement when a second operator acknowledges the same alert', async () => {
    const first = await service.acknowledge(ITEM_ID, OFFERED_AT.toISOString(), OPERATOR);
    const second = await service.acknowledge(ITEM_ID, OFFERED_AT.toISOString(), SECOND);

    expect(second).toEqual(first);
    expect(store.audits).toHaveLength(1);
    expect(publisher.events).toHaveLength(1);
  });

  it('acknowledges the new offer’s alert even though an earlier offer’s was acknowledged', async () => {
    await service.acknowledge(ITEM_ID, OFFERED_AT.toISOString(), OPERATOR);
    const reoffered = new Date(OFFERED_AT.getTime() + 3 * 60 * 60 * 1000);
    store.items = [
      makeItem({
        status: ServiceItemStatus.Declined,
        offeredAt: reoffered,
        respondedAt: new Date(reoffered.getTime() + 10 * 60 * 1000),
      }),
    ];

    const ack = await service.acknowledge(ITEM_ID, reoffered.toISOString(), SECOND);

    expect(store.audits).toHaveLength(2);
    // An operator without a name is named by their email.
    expect(ack.by).toBe('user-ops-2@example.test');
  });

  it('refuses an alert whose item was offered again or is no longer red', async () => {
    await expect(
      service.acknowledge(ITEM_ID, '2026-10-29T09:00:00.000Z', OPERATOR),
    ).rejects.toMatchObject({ status: 409 });

    const future = new Date(Date.now() + 60 * 60 * 1000);
    store.items = [
      makeItem({
        status: ServiceItemStatus.Offered,
        offeredAt: new Date(),
        dispatchDeadline: future,
      }),
    ];
    await expect(
      service.acknowledge(ITEM_ID, store.items[0]!.offeredAt!.toISOString(), OPERATOR),
    ).rejects.toMatchObject({ status: 409 });
    expect(store.audits).toHaveLength(0);
  });

  it('answers 404 for an unknown item', async () => {
    await expect(service.acknowledge('nope', null, OPERATOR)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('records where an acknowledgement, a mute and an unmute came from', async () => {
    await service.acknowledge(ITEM_ID, OFFERED_AT.toISOString(), OPERATOR, 'ops_lite');
    await service.mute(OPERATOR, 'ops_lite');
    store.audits[1]!.createdAt = new Date(Date.now() - 1000);
    await service.unmute(SECOND);

    expect(store.audits.map((row) => row.metadata?.channel)).toEqual([
      'ops_lite',
      'ops_lite',
      'desk',
    ]);
  });

  it('mutes the desk for 15 minutes, logged with the actor', async () => {
    const before = Date.now();
    const { mute } = await service.mute(OPERATOR);

    expect(mute?.by).toBe('Ana Rodríguez');
    expect(new Date(mute!.until).getTime() - new Date(mute!.startedAt).getTime()).toBe(
      ALERT_MUTE_MS,
    );
    expect(new Date(mute!.startedAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(store.audits).toEqual([
      expect.objectContaining({
        actorUserId: OPERATOR.id,
        action: ALERTS_MUTED,
        entityType: 'DispatchDesk',
        entityId: null,
      }),
    ]);
    expect(publisher.events).toEqual([expect.objectContaining({ type: 'alert.muted' })]);
    expect((await service.currentMute()).mute).toEqual(mute);
  });

  it('lets a mute run out on its own', async () => {
    await service.mute(OPERATOR);
    const later = new Date(Date.now() + ALERT_MUTE_MS + 1000);

    expect((await service.currentMute(later)).mute).toBeNull();
  });

  it('lifts the mute on unmute, logged, and records nothing when there is none', async () => {
    await service.mute(OPERATOR);
    // The unmute comes after the mute, as it does in time.
    store.audits[0]!.createdAt = new Date(Date.now() - 1000);

    expect(await service.unmute(SECOND)).toEqual({ mute: null });
    expect(store.audits.map((row) => row.action)).toEqual([ALERTS_MUTED, ALERTS_UNMUTED]);
    expect((await service.currentMute()).mute).toBeNull();

    await service.unmute(SECOND);
    expect(store.audits).toHaveLength(2);
    expect(publisher.events.map((event) => event.type)).toEqual([
      'alert.muted',
      'alert.unmuted',
    ]);
  });
});
