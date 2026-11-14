import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ALERT_MUTE_MS,
  activeMute,
  alertKey,
  serviceItemAlert,
  type ServiceItemStatus,
} from '@ota/domain';
import type {
  AlertAcknowledgementDto,
  DeskAlertMuteStateDto,
  DeskChannel,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import {
  ESCALATION_PUBLISHER,
  type EscalationPublisher,
} from '../escalation/escalation.publisher';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACKNOWLEDGEMENT_SELECT,
  ALERT_ACKNOWLEDGED,
  acknowledgementsByAlert,
  actorLabel,
} from './alert-acknowledgements';

/** The audit trail's subject for the desk's mute: one desk per agency. */
export const DISPATCH_DESK_ENTITY = 'DispatchDesk';
export const ALERTS_MUTED = 'dispatch.alerts_muted';
export const ALERTS_UNMUTED = 'dispatch.alerts_unmuted';

/**
 * The desk's handling of its dispatch alerts (A-A11y 01; owner decision
 * 2026-10-29: per desk, audited). An acknowledgement stops a red alert's cue
 * for everyone on the desk; "Mute 15 min" silences the alerts already raised.
 * Both live only in the audit log, so the trail is the state, and both are
 * broadcast on `/ops` so every open desk follows.
 */
@Injectable()
export class DeskAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ESCALATION_PUBLISHER) private readonly escalation: EscalationPublisher,
  ) {}

  /**
   * Acknowledge an item's red alert for the desk. `offeredAt` names the offer
   * the operator saw: an item offered again since, or no longer red, is a
   * conflict. A second acknowledgement of the same alert returns the first.
   */
  async acknowledge(
    serviceItemId: string,
    offeredAt: string | null,
    actor: AuthUser,
    channel: DeskChannel = 'desk',
  ): Promise<AlertAcknowledgementDto> {
    const item = await this.prisma.serviceItem.findUnique({
      where: { id: serviceItemId },
    });
    if (!item) {
      throw new NotFoundException(`Service item ${serviceItemId} not found`);
    }
    const now = new Date();
    const current = item.offeredAt ? item.offeredAt.toISOString() : null;
    if (current !== offeredAt) {
      throw new ConflictException('The service was offered again; its alert changed.');
    }
    const alert = serviceItemAlert({
      status: item.status as ServiceItemStatus,
      offeredAt: item.offeredAt,
      deadline: item.dispatchDeadline,
      now,
    });
    if (alert !== 'RED') {
      throw new ConflictException('The service has no red alert to acknowledge.');
    }

    const key = alertKey(item.id, current);
    const earlier = acknowledgementsByAlert(
      await this.prisma.auditLog.findMany({
        where: {
          action: ALERT_ACKNOWLEDGED,
          entityType: 'ServiceItem',
          entityId: item.id,
        },
        select: ACKNOWLEDGEMENT_SELECT,
      }),
    ).get(key);
    if (earlier) {
      return earlier;
    }

    const row = await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: ALERT_ACKNOWLEDGED,
        entityType: 'ServiceItem',
        entityId: item.id,
        metadata: {
          offeredAt: current,
          reservationId: item.reservationId,
          status: item.status,
          channel,
        },
      },
      select: ACKNOWLEDGEMENT_SELECT,
    });
    this.escalation.publish({
      type: 'alert.acknowledged',
      serviceItemId: item.id,
      occurredAt: row.createdAt.toISOString(),
    });
    return { at: row.createdAt.toISOString(), by: actorLabel(row.actor) };
  }

  /** The mute in force, if any: the desk's latest mute or unmute decides. */
  async currentMute(now = new Date()): Promise<DeskAlertMuteStateDto> {
    const latest = await this.prisma.auditLog.findFirst({
      where: {
        entityType: DISPATCH_DESK_ENTITY,
        action: { in: [ALERTS_MUTED, ALERTS_UNMUTED] },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        action: true,
        metadata: true,
        createdAt: true,
        actor: { select: { fullName: true, email: true } },
      },
    });
    const mute = activeMute(
      latest
        ? {
            kind: latest.action === ALERTS_MUTED ? 'muted' : 'unmuted',
            at: latest.createdAt,
            until: muteEnd(latest.metadata),
          }
        : null,
      now,
    );
    return {
      mute: mute
        ? {
            startedAt: mute.startedAt.toISOString(),
            until: mute.until.toISOString(),
            by: actorLabel(latest?.actor ?? null),
          }
        : null,
    };
  }

  /**
   * Mute the desk's cue for 15 minutes from now. Muting again starts a new
   * window, which then also covers the alerts raised since the first.
   */
  async mute(
    actor: AuthUser,
    channel: DeskChannel = 'desk',
  ): Promise<DeskAlertMuteStateDto> {
    const now = new Date();
    const until = new Date(now.getTime() + ALERT_MUTE_MS);
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: ALERTS_MUTED,
        entityType: DISPATCH_DESK_ENTITY,
        createdAt: now,
        metadata: {
          until: until.toISOString(),
          minutes: ALERT_MUTE_MS / 60_000,
          channel,
        },
      },
    });
    this.escalation.publish({
      type: 'alert.muted',
      serviceItemId: null,
      occurredAt: now.toISOString(),
    });
    return this.currentMute(now);
  }

  /** Lift the mute in force; with none, nothing is recorded. */
  async unmute(
    actor: AuthUser,
    channel: DeskChannel = 'desk',
  ): Promise<DeskAlertMuteStateDto> {
    const now = new Date();
    const { mute } = await this.currentMute(now);
    if (!mute) {
      return { mute: null };
    }
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: ALERTS_UNMUTED,
        entityType: DISPATCH_DESK_ENTITY,
        createdAt: now,
        metadata: { mutedUntil: mute.until, channel },
      },
    });
    this.escalation.publish({
      type: 'alert.unmuted',
      serviceItemId: null,
      occurredAt: now.toISOString(),
    });
    return { mute: null };
  }
}

function muteEnd(metadata: unknown): Date | null {
  if (metadata && typeof metadata === 'object' && 'until' in metadata) {
    const until = (metadata as { until: unknown }).until;
    return typeof until === 'string' ? new Date(until) : null;
  }
  return null;
}
