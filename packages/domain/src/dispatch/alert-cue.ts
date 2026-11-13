import { ServiceItemStatus } from '../reservation/status';

/** A-A11y 01: a red alert's cue repeats this often until it is acknowledged. */
export const ALERT_CUE_REPEAT_MS = 60 * 1000;

/** A-Dashboard's "Mute 15 min". */
export const ALERT_MUTE_MS = 15 * 60 * 1000;

/**
 * A-States: an acknowledgement can be undone for this long; it is recorded
 * only once the window closes.
 */
export const ALERT_ACK_UNDO_MS = 6 * 1000;

/**
 * A red alert's identity: the service item and the offer that raised it. A
 * re-dispatch makes a new offer, so its alert is a new one and an earlier
 * acknowledgement no longer covers it.
 */
export function alertKey(serviceItemId: string, offeredAt: string | null): string {
  return `${serviceItemId}@${offeredAt ?? 'none'}`;
}

export interface RedAlertClock {
  status: ServiceItemStatus;
  deadline: Date | null;
  respondedAt: Date | null;
}

/**
 * When a red item turned red: its decline, else its deadline (a timeout, or an
 * open offer whose clock ran out before the timeout job fired). Null when
 * neither is known.
 */
export function redSince({ status, deadline, respondedAt }: RedAlertClock): Date | null {
  if (status === ServiceItemStatus.Declined && respondedAt) {
    return respondedAt;
  }
  return deadline;
}

/** The desk's "Mute 15 min", as the audit log records it. */
export interface DeskAlertMute {
  startedAt: Date;
  until: Date;
}

/** The desk's latest mute or unmute entry. */
export interface DeskAlertMuteEntry {
  kind: 'muted' | 'unmuted';
  at: Date;
  /** A mute's end; null on an unmute. */
  until: Date | null;
}

/**
 * The mute in force at `now`: the latest entry, when it is a mute that has
 * not run out. An unmute or an expired mute leaves the cue on.
 */
export function activeMute(
  latest: DeskAlertMuteEntry | null,
  now: Date,
): DeskAlertMute | null {
  if (!latest || latest.kind !== 'muted' || !latest.until) {
    return null;
  }
  return latest.until.getTime() > now.getTime()
    ? { startedAt: latest.at, until: latest.until }
    : null;
}

/**
 * Whether a mute silences an alert raised at `raisedAt`. It silences only the
 * alerts already raised when it began: a new red alert always sounds
 * (A-Dashboard).
 */
export function muteSilences(
  mute: DeskAlertMute | null,
  raisedAt: Date | null,
  now: Date,
): boolean {
  if (!mute || mute.until.getTime() <= now.getTime()) {
    return false;
  }
  return raisedAt !== null && raisedAt.getTime() <= mute.startedAt.getTime();
}

export interface CueRedAlert {
  key: string;
  raisedAt: Date | null;
  /** Acknowledged by anyone on the desk, or waiting out its undo here. */
  acknowledged: boolean;
  /** Whether this desk has already played a cue for it. */
  cued: boolean;
}

export interface AlertCueInput {
  red: readonly CueRedAlert[];
  /** Items that crossed into amber since the last look (`alertCrossings`). */
  amberCrossings: number;
  mute: DeskAlertMute | null;
  /** When this desk last played the red cue. */
  lastRedCueAt: Date | null;
  now: Date;
}

/**
 * The cue the desk plays at `now` (A-A11y 01), if any. A red alert sounds at
 * once when this desk has not cued it yet, then every 60 s while any red
 * alert is unacknowledged and not silenced by the mute. An item that crosses
 * into amber gets one cue, which the mute silences; amber never repeats.
 */
export function alertCue({
  red,
  amberCrossings,
  mute,
  lastRedCueAt,
  now,
}: AlertCueInput): 'RED' | 'AMBER' | null {
  const sounding = red.filter(
    (alert) => !alert.acknowledged && !muteSilences(mute, alert.raisedAt, now),
  );
  if (sounding.length > 0) {
    if (
      lastRedCueAt === null ||
      sounding.some((alert) => !alert.cued) ||
      now.getTime() - lastRedCueAt.getTime() >= ALERT_CUE_REPEAT_MS
    ) {
      return 'RED';
    }
  }
  const muted = mute !== null && mute.until.getTime() > now.getTime();
  return amberCrossings > 0 && !muted ? 'AMBER' : null;
}
