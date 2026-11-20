import { describe, expect, it } from 'vitest';

import {
  EVENT_HOLD_REMINDER_DAYS,
  eventBuilderStart,
  eventHoldReminderDue,
  eventHoldShows,
  eventPhotoIssues,
} from '../src';

const day = (value: string) => new Date(`${value}T00:00:00Z`);
// 10:00 in Havana on 20 Nov 2026.
const NOW = new Date('2026-11-20T15:00:00Z');

describe('a festival room hold (H1a)', () => {
  it('shows through its last day in Havana, and not after', () => {
    expect(eventHoldShows(day('2026-11-20'), NOW)).toBe(true);
    expect(eventHoldShows(day('2026-12-01'), NOW)).toBe(true);
    expect(eventHoldShows(day('2026-11-19'), NOW)).toBe(false);
    expect(eventHoldShows(null, NOW)).toBe(false);
  });

  it('reads the day in Havana, not in UTC', () => {
    // 02:00 UTC on 21 Nov is still the evening of 20 Nov in Havana.
    expect(eventHoldShows(day('2026-11-20'), new Date('2026-11-21T02:00:00Z'))).toBe(
      true,
    );
  });
});

describe('the desk reminder for a hold (H2a)', () => {
  it(`starts ${EVENT_HOLD_REMINDER_DAYS} days before the last day`, () => {
    expect(eventHoldReminderDue(day('2026-11-23'), NOW)).toBe(true);
    expect(eventHoldReminderDue(day('2026-11-24'), NOW)).toBe(false);
  });

  it('stays the day after the hold ends, then stops', () => {
    expect(eventHoldReminderDue(day('2026-11-19'), NOW)).toBe(true);
    expect(eventHoldReminderDue(day('2026-11-18'), NOW)).toBe(false);
    expect(eventHoldReminderDue(null, NOW)).toBe(false);
  });
});

describe('the builder link from an event (H3a)', () => {
  const event = {
    startsOn: day('2027-02-10'),
    endsOn: day('2027-02-14'),
    province: 'CU03',
  };

  it('arrives on the first day and leaves the morning after the last night', () => {
    expect(eventBuilderStart(event, NOW)).toEqual({
      from: '2027-02-10',
      to: '2027-02-15',
      province: 'CU03',
    });
  });

  it('arrives today once the event has started, and offers nothing once it is over', () => {
    const running = { ...event, startsOn: day('2026-11-18'), endsOn: day('2026-11-22') };
    expect(eventBuilderStart(running, NOW)).toMatchObject({
      from: '2026-11-20',
      to: '2026-11-23',
    });
    const over = { ...event, startsOn: day('2026-11-10'), endsOn: day('2026-11-19') };
    expect(eventBuilderStart(over, NOW)).toBeNull();
  });

  it('proposes at most 30 nights for a long season', () => {
    const season = { ...event, startsOn: day('2027-01-01'), endsOn: day('2027-03-31') };
    expect(eventBuilderStart(season, NOW)).toMatchObject({
      from: '2027-01-01',
      to: '2027-01-31',
    });
  });
});

describe("an event's photos (P1a)", () => {
  it('needs alt text, and a consent reference for a photo of people', () => {
    expect(
      eventPhotoIssues([
        { altText: 'The stage at night', showsPeople: false, consentReference: null },
        { altText: 'Dancers', showsPeople: true, consentReference: 'REL-0042' },
      ]),
    ).toEqual([]);
    expect(
      eventPhotoIssues([
        { altText: ' ', showsPeople: false, consentReference: null },
        { altText: 'Dancers', showsPeople: true, consentReference: ' ' },
      ]),
    ).toEqual(['MEDIA_ALT_REQUIRED', 'MEDIA_CONSENT_REQUIRED']);
  });
});
