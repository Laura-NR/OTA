/**
 * The offline kit (Account board "Documents & offline kit"; DS 05 offline
 * mode): a trip page and its documents saved on the traveler's device, read
 * only, so the itinerary, vouchers and contacts open with no signal. The
 * storefront saves it in the browser's Cache Storage when the traveler asks,
 * and its service worker serves it when the network fails.
 */

/** Where a kit's description is kept in the cache, followed by the booking id. */
export const OFFLINE_KIT_ENTRY_PREFIX = '/__offline-kit/';

export interface OfflineKitEntry {
  reservationId: string;
  bookingCode: string;
  /** The trip page as saved, locale prefix included (`/en/account/reservations/…`). */
  pagePath: string;
  /** Every same-origin path saved for this kit: the page, its documents and assets. */
  paths: string[];
  /** How many of `paths` are documents. */
  documentCount: number;
  /** ISO instant of the last save. */
  savedAt: string;
  /** Bytes saved, as downloaded. */
  bytes: number;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** A kit description read back from the cache, or null when it is not one. */
export function parseOfflineKitEntry(value: unknown): OfflineKitEntry | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const entry = value as Record<string, unknown>;
  if (
    !isString(entry.reservationId) ||
    !isString(entry.bookingCode) ||
    !isString(entry.pagePath) ||
    !entry.pagePath.startsWith('/') ||
    !Array.isArray(entry.paths) ||
    !entry.paths.every((path) => isString(path) && path.startsWith('/')) ||
    !isCount(entry.documentCount) ||
    !isString(entry.savedAt) ||
    Number.isNaN(Date.parse(entry.savedAt)) ||
    !isCount(entry.bytes)
  ) {
    return null;
  }
  return {
    reservationId: entry.reservationId,
    bookingCode: entry.bookingCode,
    pagePath: entry.pagePath,
    paths: entry.paths as string[],
    documentCount: entry.documentCount,
    savedAt: entry.savedAt,
    bytes: entry.bytes,
  };
}

/** A booking document's download path, the one the trip page links to. */
export function offlineDocumentPath(documentId: string): string {
  return `/api/ota/documents/${documentId}/download`;
}

/**
 * The build assets a saved page needs to render and hydrate offline: every
 * `/_next/static/` file its HTML names, in tags or in the inline React payload
 * (where the `/_next/` prefix is dropped). A path must end in a file extension:
 * the payload is split across script tags, which can cut a path in two. The
 * service worker keeps its own copy of this pattern for the offline page; keep
 * the two alike.
 */
export function offlineAssetPaths(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(
    /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[^"'\s\\)<>]+?\.(?:js|css|woff2|svg|png|jpg|webp)(?:\?[^"'\s\\)<>]*)?)(?![\w.-])/g,
  )) {
    found.add(`/_next/${match[1]!.replace(/&amp;/g, '&')}`);
  }
  return [...found];
}

/** The documents issued since the kit was saved, which "Update kit" would add. */
export function offlineKitMissingDocuments(
  entry: OfflineKitEntry,
  documentIds: readonly string[],
): string[] {
  const saved = new Set(entry.paths);
  return documentIds.filter((id) => !saved.has(offlineDocumentPath(id)));
}
