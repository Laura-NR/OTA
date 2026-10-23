import {
  dispatchTimerPolicy,
  type DispatchTimers,
  type OperatingThresholds,
} from '@ota/domain';

// Client-safe: no server imports, so client components take these values.

/**
 * What the desk's timers, alerts and their copy read: plain numbers, so
 * client components take them as props.
 */
export interface DeskClock {
  amberThreshold: number;
  timers: DispatchTimers;
  amberPercent: number;
  credentialDays: number;
  floorPercent: number;
  minAnswered: number;
}

export function deskClock(thresholds: OperatingThresholds): DeskClock {
  return {
    amberThreshold: thresholds.amberPercent / 100,
    timers: dispatchTimerPolicy(thresholds),
    amberPercent: thresholds.amberPercent,
    credentialDays: thresholds.credentialExpiryWindowDays,
    floorPercent: thresholds.reliabilityFloorPercent,
    minAnswered: thresholds.reliabilityMinAnswered,
  };
}

/** "2 h", "30 min" or "1 h 30 min": a timer as the desk's copy states it. */
export function durationText(ms: number): string {
  const total = Math.round(ms / 60_000);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** The dispatch-timer copy's parameters: `{standard}`, `{short}`, `{window}`, `{amber}`. */
export function timerCopy(clock: DeskClock) {
  return {
    standard: durationText(clock.timers.standardMs),
    short: durationText(clock.timers.shortNoticeMs),
    window: Math.round(clock.timers.shortNoticeWindowMs / 3_600_000),
    amber: clock.amberPercent,
  };
}
