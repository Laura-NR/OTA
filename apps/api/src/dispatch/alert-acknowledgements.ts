import type { Prisma } from '@ota/db';
import { alertKey } from '@ota/domain';
import type { AlertAcknowledgementDto } from '@ota/schemas';

/** The audit action that records a red alert acknowledged for the desk. */
export const ALERT_ACKNOWLEDGED = 'dispatch.alert_acknowledged';

export interface AuditActor {
  fullName: string | null;
  email: string;
}

/** An acknowledgement as the audit log holds it. */
export interface AcknowledgementRow {
  entityId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  actor: AuditActor | null;
}

/** The select that reads acknowledgement rows with their operator. */
export const ACKNOWLEDGEMENT_SELECT = {
  entityId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { fullName: true, email: true } },
} as const;

/** How the desk names an operator: their name, else their email. */
export function actorLabel(actor: AuditActor | null): string | null {
  return actor ? actor.fullName || actor.email : null;
}

function acknowledgedOffer(metadata: Prisma.JsonValue | null): string | null {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const offeredAt = metadata.offeredAt;
    return typeof offeredAt === 'string' ? offeredAt : null;
  }
  return null;
}

/**
 * Each acknowledged alert (`alertKey`: the item and its offer) with its
 * earliest acknowledgement, the one that stopped the cue.
 */
export function acknowledgementsByAlert(
  rows: readonly AcknowledgementRow[],
): Map<string, AlertAcknowledgementDto> {
  const byAlert = new Map<string, AlertAcknowledgementDto>();
  const oldestFirst = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const row of oldestFirst) {
    if (!row.entityId) {
      continue;
    }
    const key = alertKey(row.entityId, acknowledgedOffer(row.metadata));
    if (!byAlert.has(key)) {
      byAlert.set(key, { at: row.createdAt.toISOString(), by: actorLabel(row.actor) });
    }
  }
  return byAlert;
}
