import { describe, expect, it } from 'vitest';

import {
  ALERT_CUE_REPEAT_MS,
  ALERT_MUTE_MS,
  ServiceItemStatus,
  activeMute,
  alertCue,
  alertKey,
  muteSilences,
  redSince,
  type CueRedAlert,
  type DeskAlertMute,
} from '../src';

const NOW = new Date('2026-10-29T18:00:00Z');
const minutesAgo = (n: number): Date => new Date(NOW.getTime() - n * 60 * 1000);
const secondsAgo = (n: number): Date => new Date(NOW.getTime() - n * 1000);

function red(overrides: Partial<CueRedAlert> = {}): CueRedAlert {
  return {
    key: 'item-1@2026-10-29T16:00:00.000Z',
    raisedAt: minutesAgo(5),
    acknowledged: false,
    cued: true,
    ...overrides,
  };
}

const MUTE: DeskAlertMute = { startedAt: minutesAgo(2), until: minutesAgo(-13) };

describe('alertKey', () => {
  it('tells a re-dispatched offer apart from the one it replaced', () => {
    expect(alertKey('item-1', '2026-10-29T16:00:00.000Z')).not.toBe(
      alertKey('item-1', '2026-10-29T17:00:00.000Z'),
    );
    expect(alertKey('item-1', null)).toBe('item-1@none');
  });
});

describe('redSince', () => {
  it('dates a decline from the answer and a timeout from the deadline', () => {
    const deadline = minutesAgo(10);
    const respondedAt = minutesAgo(30);
    expect(
      redSince({ status: ServiceItemStatus.Declined, deadline, respondedAt }),
    ).toEqual(respondedAt);
    expect(
      redSince({ status: ServiceItemStatus.Timeout, deadline, respondedAt: null }),
    ).toEqual(deadline);
    expect(
      redSince({ status: ServiceItemStatus.Offered, deadline, respondedAt: null }),
    ).toEqual(deadline);
  });
});

describe('activeMute', () => {
  it('holds a mute until it runs out', () => {
    const until = new Date(minutesAgo(2).getTime() + ALERT_MUTE_MS);
    expect(activeMute({ kind: 'muted', at: minutesAgo(2), until }, NOW)).toEqual({
      startedAt: minutesAgo(2),
      until,
    });
    expect(
      activeMute({ kind: 'muted', at: minutesAgo(20), until: minutesAgo(5) }, NOW),
    ).toBeNull();
  });

  it('is lifted by an unmute and absent without an entry', () => {
    expect(
      activeMute({ kind: 'unmuted', at: minutesAgo(1), until: null }, NOW),
    ).toBeNull();
    expect(activeMute(null, NOW)).toBeNull();
  });
});

describe('muteSilences', () => {
  it('silences only the alerts raised before the mute began', () => {
    expect(muteSilences(MUTE, minutesAgo(5), NOW)).toBe(true);
    expect(muteSilences(MUTE, minutesAgo(1), NOW)).toBe(false);
  });

  it('silences nothing once it ran out', () => {
    expect(
      muteSilences(
        { startedAt: minutesAgo(20), until: minutesAgo(5) },
        minutesAgo(30),
        NOW,
      ),
    ).toBe(false);
  });
});

describe('alertCue', () => {
  const base = { amberCrossings: 0, mute: null, lastRedCueAt: null, now: NOW };

  it('sounds a red alert at once, then every 60 s until it is acknowledged', () => {
    expect(alertCue({ ...base, red: [red({ cued: false })] })).toBe('RED');
    expect(alertCue({ ...base, red: [red()], lastRedCueAt: secondsAgo(30) })).toBeNull();
    expect(
      alertCue({
        ...base,
        red: [red()],
        lastRedCueAt: new Date(NOW.getTime() - ALERT_CUE_REPEAT_MS),
      }),
    ).toBe('RED');
    expect(
      alertCue({
        ...base,
        red: [red({ acknowledged: true })],
        lastRedCueAt: minutesAgo(5),
      }),
    ).toBeNull();
  });

  it('sounds a new red alert without waiting for the repeat', () => {
    expect(
      alertCue({
        ...base,
        red: [red(), red({ key: 'item-2@x', cued: false })],
        lastRedCueAt: secondsAgo(10),
      }),
    ).toBe('RED');
  });

  it('lets the mute silence existing red alerts but never a new one', () => {
    expect(
      alertCue({ ...base, red: [red()], mute: MUTE, lastRedCueAt: minutesAgo(3) }),
    ).toBeNull();
    expect(
      alertCue({
        ...base,
        red: [red(), red({ key: 'item-2@x', raisedAt: secondsAgo(5), cued: false })],
        mute: MUTE,
        lastRedCueAt: minutesAgo(3),
      }),
    ).toBe('RED');
  });

  it('gives amber one cue, which the mute silences', () => {
    expect(alertCue({ ...base, red: [], amberCrossings: 1 })).toBe('AMBER');
    expect(alertCue({ ...base, red: [], amberCrossings: 0 })).toBeNull();
    expect(alertCue({ ...base, red: [], amberCrossings: 1, mute: MUTE })).toBeNull();
  });
});
