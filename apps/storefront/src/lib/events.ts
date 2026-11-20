import type { PublicEventDto } from '@ota/schemas';
import { getLocale } from 'next-intl/server';

import { apiBaseUrl } from './api';

/**
 * The public events (M10 D2) in the active locale: published ones until their
 * last day. Cached for 60 s like the packages, and tolerant of an unavailable
 * API so a cold build still renders the page shell.
 */
export async function getEvents(): Promise<PublicEventDto[]> {
  try {
    const locale = await getLocale();
    const response = await fetch(
      `${apiBaseUrl()}/catalog/events?locale=${encodeURIComponent(locale)}`,
      { next: { revalidate: 60 } },
    );
    return response.ok ? ((await response.json()) as PublicEventDto[]) : [];
  } catch {
    return [];
  }
}

export async function getEvent(slug: string): Promise<PublicEventDto | null> {
  try {
    const locale = await getLocale();
    const response = await fetch(
      `${apiBaseUrl()}/catalog/events/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`,
      { next: { revalidate: 60 } },
    );
    return response.ok ? ((await response.json()) as PublicEventDto) : null;
  } catch {
    return null;
  }
}

/** An event photo through the same-origin API rewrite (P2: published events only). */
export function eventMediaUrl(mediaId: string): string {
  return `/api/ota/catalog/events/media/${mediaId}`;
}

/**
 * The custom builder opened with the event's dates and province placed
 * (`docs/schema-m10-holds-photos.md` H3a); null once the event is over.
 */
export function eventBuilderHref(event: PublicEventDto): string | null {
  if (!event.builderStart) return null;
  const { from, to, province } = event.builderStart;
  return `/custom?${new URLSearchParams({ from, to, province }).toString()}`;
}
