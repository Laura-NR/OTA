import {
  OFFLINE_KIT_ENTRY_PREFIX,
  offlineAssetPaths,
  offlineDocumentPath,
  parseOfflineKitEntry,
  type OfflineKitEntry,
} from '@ota/domain';

/**
 * The offline kit in the browser's Cache Storage (Account board, DS 05):
 * saved only when the traveler asks, read back by the service worker
 * (`public/sw.js`, which uses the same cache name) when the network fails,
 * and deleted at sign-out. Browser-only; call from client components.
 */
export const OFFLINE_KIT_CACHE = 'ota-kit-v1';

const entryKey = (reservationId: string) => `${OFFLINE_KIT_ENTRY_PREFIX}${reservationId}`;

/** Whether this browser can keep and serve a kit. */
export function offlineKitSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'caches' in window &&
    'serviceWorker' in navigator
  );
}

/** Download `path` and keep it; its size in bytes. Throws when it fails. */
async function keep(
  cache: Cache,
  path: string,
): Promise<{ bytes: number; text?: string }> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok || response.redirected) {
    throw new Error(`Could not save ${path} (${response.status})`);
  }
  const html = (response.headers.get('content-type') ?? '').includes('text/html');
  const body = await response.clone().blob();
  await cache.put(path, response);
  return { bytes: body.size, text: html ? await body.text() : undefined };
}

export async function readOfflineKit(
  reservationId: string,
): Promise<OfflineKitEntry | null> {
  const cache = await caches.open(OFFLINE_KIT_CACHE);
  const stored = await cache.match(entryKey(reservationId));
  return stored ? parseOfflineKitEntry(await stored.json().catch(() => null)) : null;
}

/** Every kit on this device, the most recently saved first. */
export async function readOfflineKits(): Promise<OfflineKitEntry[]> {
  if (!(await caches.has(OFFLINE_KIT_CACHE))) {
    return [];
  }
  const cache = await caches.open(OFFLINE_KIT_CACHE);
  const entries: OfflineKitEntry[] = [];
  for (const request of await cache.keys()) {
    if (!new URL(request.url).pathname.startsWith(OFFLINE_KIT_ENTRY_PREFIX)) {
      continue;
    }
    const stored = await cache.match(request);
    const entry = stored
      ? parseOfflineKitEntry(await stored.json().catch(() => null))
      : null;
    if (entry) {
      entries.push(entry);
    }
  }
  return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

/**
 * Save (or update) a trip's kit: the trip page as the traveler sees it, every
 * document, and the build assets the page needs to render offline. Files the
 * previous save kept and this one no longer lists are dropped.
 */
export async function saveOfflineKit(kit: {
  reservationId: string;
  bookingCode: string;
  pagePath: string;
  documentIds: readonly string[];
}): Promise<OfflineKitEntry> {
  const cache = await caches.open(OFFLINE_KIT_CACHE);
  const previous = await readOfflineKit(kit.reservationId);
  const page = await keep(cache, kit.pagePath);
  let bytes = page.bytes;
  const documents = kit.documentIds.map(offlineDocumentPath);
  for (const path of documents) {
    bytes += (await keep(cache, path)).bytes;
  }
  const assets = offlineAssetPaths(page.text ?? '');
  for (const path of assets) {
    // An asset that will not download leaves the page readable without it.
    bytes += (await keep(cache, path).catch(() => ({ bytes: 0 }))).bytes;
  }

  const entry: OfflineKitEntry = {
    reservationId: kit.reservationId,
    bookingCode: kit.bookingCode,
    pagePath: kit.pagePath,
    paths: [kit.pagePath, ...documents, ...assets],
    documentCount: documents.length,
    savedAt: new Date().toISOString(),
    bytes,
  };
  await cache.put(
    entryKey(kit.reservationId),
    new Response(JSON.stringify(entry), {
      headers: { 'content-type': 'application/json' },
    }),
  );
  if (previous) {
    await dropUnshared(cache, previous.paths, entry.paths);
  }
  return entry;
}

/** Remove the files only `paths` used; build assets other kits share stay. */
async function dropUnshared(cache: Cache, paths: string[], keepPaths: string[] = []) {
  const kept = new Set(keepPaths);
  for (const other of await readOfflineKits()) {
    for (const path of other.paths) {
      kept.add(path);
    }
  }
  for (const path of paths) {
    if (!kept.has(path)) {
      await cache.delete(path);
    }
  }
}

export async function removeOfflineKit(reservationId: string): Promise<void> {
  const cache = await caches.open(OFFLINE_KIT_CACHE);
  const entry = await readOfflineKit(reservationId);
  await cache.delete(entryKey(reservationId));
  if (entry) {
    await dropUnshared(cache, entry.paths);
  }
  if ((await readOfflineKits()).length === 0) {
    await caches.delete(OFFLINE_KIT_CACHE);
  }
}

/** Sign-out: no saved trip stays on a device its traveler left. */
export async function clearOfflineKits(): Promise<void> {
  if (typeof window !== 'undefined' && 'caches' in window) {
    await caches.delete(OFFLINE_KIT_CACHE);
  }
}
