import { zonedCalendarDay } from '../time/ops-calendar';

/**
 * M10 follow-ups (`docs/schema-m10-holds-photos.md`): the room an event holds
 * at a casa for concierge requests (H1–H3), and its photos (P1). A hold is a
 * line on the event page, not a count: the desk keeps the room with the host.
 */

const DAY_MS = 86_400_000;

/** H2a: the desk's reminder starts this many days before the hold ends. */
export const EVENT_HOLD_REMINDER_DAYS = 3;

/** H1a: the line shows through its last day, in Havana. */
export function eventHoldShows(holdUntil: Date | null, now: Date): boolean {
  return holdUntil !== null && holdUntil.getTime() >= zonedCalendarDay(now).getTime();
}

/**
 * H2a: the dashboard task, from `EVENT_HOLD_REMINDER_DAYS` before the last day
 * until the day after it, so a hold that just ended is still released by hand.
 */
export function eventHoldReminderDue(holdUntil: Date | null, now: Date): boolean {
  if (holdUntil === null) return false;
  const today = zonedCalendarDay(now).getTime();
  return (
    today >= holdUntil.getTime() - EVENT_HOLD_REMINDER_DAYS * DAY_MS &&
    today <= holdUntil.getTime() + DAY_MS
  );
}

/** The longest trip the builder link proposes; the traveler can change it. */
const MAX_BUILDER_NIGHTS = 30;

/**
 * H3a: the custom builder's start for an event: arrival on its first day (or
 * today, once it has started), the stay to the morning after its last night,
 * and its province placed. Null when the event has ended.
 */
export function eventBuilderStart(
  event: { startsOn: Date; endsOn: Date; province: string },
  now: Date,
): { from: string; to: string; province: string } | null {
  const today = zonedCalendarDay(now).getTime();
  const departure = event.endsOn.getTime() + DAY_MS;
  if (departure <= today) return null;
  const arrival = Math.max(event.startsOn.getTime(), today);
  const to = Math.min(departure, arrival + MAX_BUILDER_NIGHTS * DAY_MS);
  return {
    from: new Date(arrival).toISOString().slice(0, 10),
    to: new Date(to).toISOString().slice(0, 10),
    province: event.province,
  };
}

/** P1a: what publishing checks on an event's photos, as for packages. */
export interface EventPhoto {
  altText: string;
  showsPeople: boolean;
  consentReference: string | null;
}

export type EventPhotoIssue = 'MEDIA_ALT_REQUIRED' | 'MEDIA_CONSENT_REQUIRED';

export function eventPhotoIssues(media: readonly EventPhoto[]): EventPhotoIssue[] {
  const issues: EventPhotoIssue[] = [];
  if (media.some((photo) => photo.altText.trim().length === 0)) {
    issues.push('MEDIA_ALT_REQUIRED');
  }
  if (
    media.some(
      (photo) => photo.showsPeople && (photo.consentReference ?? '').trim().length === 0,
    )
  ) {
    issues.push('MEDIA_CONSENT_REQUIRED');
  }
  return issues;
}
