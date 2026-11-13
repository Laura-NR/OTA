import type { PackageDto } from '@ota/schemas';
import { getLocale } from 'next-intl/server';

function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

/**
 * Read the public curated-package catalogue for the active locale (M1's
 * per-locale overlay). Cached for 60s and tolerant of an unavailable API so a
 * cold build or a briefly-down backend still renders the page shell.
 */
export async function getPackages(): Promise<PackageDto[]> {
  try {
    const locale = await getLocale();
    const response = await fetch(
      `${apiBaseUrl()}/catalog/packages?locale=${encodeURIComponent(locale)}`,
      { next: { revalidate: 60 } },
    );
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as PackageDto[];
  } catch {
    return [];
  }
}

/**
 * Read one curated package, cached for 60s like the list. `fresh` skips the
 * cache: the Booking form posts the departure ids it was rendered with, and a
 * package save in the editor can remove an unbooked departure, so a cached copy
 * can offer an id the API then refuses.
 */
export async function getPackage(
  slug: string,
  { fresh = false }: { fresh?: boolean } = {},
): Promise<PackageDto | null> {
  try {
    const locale = await getLocale();
    const response = await fetch(
      `${apiBaseUrl()}/catalog/packages/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`,
      fresh ? { cache: 'no-store' } : { next: { revalidate: 60 } },
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PackageDto;
  } catch {
    return null;
  }
}
