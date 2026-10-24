/* global self, caches, fetch, URL, Response */

/*
 * The storefront's service worker (Phase 8 item 2; DS 05 offline mode). It
 * never answers from a cache while the network answers, so online browsing
 * and the dev server behave as without it. When the network fails it serves,
 * in order: the traveler's saved offline kit (a trip page, its documents and
 * the build assets they need; saved by `src/lib/offline-kit.ts`, never here),
 * then the offline page of the request's locale. Nothing personal is cached
 * unless the traveler saved it, and signing out deletes the kit.
 *
 * Registered by `components/offline/service-worker.tsx` as
 * `/sw.js?locales=es,en,fr&default=es`.
 */

const SHELL_CACHE = 'ota-shell-v1';
/** The offline kit's cache; `src/lib/offline-kit.ts` writes it under the same name. */
const KIT_CACHE = 'ota-kit-v1';
/** Where a kit's description is kept (`OFFLINE_KIT_ENTRY_PREFIX` in @ota/domain). */
const KIT_ENTRY_PREFIX = '/__offline-kit/';
const DOCUMENT_DOWNLOAD = /^\/api\/ota\/documents\/[^/]+\/download$/;

const params = new URL(self.location.href).searchParams;
const DEFAULT_LOCALE = params.get('default') || '';
const PREFIXED_LOCALES = (params.get('locales') || '')
  .split(',')
  .filter((locale) => locale && locale !== DEFAULT_LOCALE);

/** The default locale is unprefixed (`localePrefix: 'as-needed'`). */
function offlinePath(locale) {
  return PREFIXED_LOCALES.includes(locale) ? `/${locale}/offline` : '/offline';
}

function requestLocale(pathname) {
  const first = pathname.split('/')[1];
  return PREFIXED_LOCALES.includes(first) ? first : DEFAULT_LOCALE;
}

/** `offlineAssetPaths` in @ota/domain, which has the tests; keep the two alike. */
function assetPaths(html) {
  const found = new Set();
  for (const match of html.matchAll(
    /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[^"'\s\\)<>]+)/g,
  )) {
    found.add(`/_next/${match[1].replace(/&amp;/g, '&')}`);
  }
  return [...found];
}

/** A response that may be cached and replayed for a navigation. */
async function replayable(response) {
  if (!response.redirected) {
    return response;
  }
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function cacheAssets(cache, html) {
  await Promise.all(
    assetPaths(html).map(async (path) => {
      try {
        const response = await fetch(path);
        if (response.ok) {
          await cache.put(path, response);
        }
      } catch {
        // An asset that will not download leaves the page readable without it.
      }
    }),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      for (const locale of [DEFAULT_LOCALE, ...PREFIXED_LOCALES]) {
        const path = offlinePath(locale);
        try {
          // Signed out and in the page's own language, so the copy kept is
          // nobody's and the locale middleware does not redirect it.
          const response = await fetch(path, {
            credentials: 'omit',
            cache: 'no-store',
            headers: locale ? { 'Accept-Language': locale } : {},
          });
          if (!response.ok) {
            continue;
          }
          await cacheAssets(cache, await response.clone().text());
          await cache.put(path, await replayable(response));
        } catch {
          // Offline at install: the next install (or update) tries again.
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('ota-shell-') && name !== SHELL_CACHE) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

/**
 * A saved trip page fetched online replaces its saved copy, with any new
 * build assets, and its kit's "updated" time moves (Account board: the kit
 * "refreshes after each change"). Pages outside a kit are never kept.
 */
async function refreshKitPage(pathname, response) {
  const kit = await caches.open(KIT_CACHE);
  if (!(await kit.match(pathname, { ignoreVary: true }))) {
    return;
  }
  await cacheAssets(kit, await response.clone().text());
  await kit.put(pathname, response);
  for (const key of await kit.keys()) {
    if (!new URL(key.url).pathname.startsWith(KIT_ENTRY_PREFIX)) {
      continue;
    }
    const stored = await kit.match(key);
    const entry = stored ? await stored.json().catch(() => null) : null;
    if (entry && entry.pagePath === pathname) {
      entry.savedAt = new Date().toISOString();
      await kit.put(
        key,
        new Response(JSON.stringify(entry), {
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
  }
}

async function navigate(event) {
  const { pathname } = new URL(event.request.url);
  try {
    const response = await fetch(event.request);
    if (
      response.ok &&
      !response.redirected &&
      response.type === 'basic' &&
      (response.headers.get('content-type') || '').includes('text/html')
    ) {
      event.waitUntil(refreshKitPage(pathname, response.clone()).catch(() => {}));
    }
    return response;
  } catch (error) {
    const saved =
      (await caches.match(pathname, { cacheName: KIT_CACHE, ignoreVary: true })) ||
      (await caches.match(offlinePath(requestLocale(pathname)), {
        cacheName: SHELL_CACHE,
      }));
    if (saved) {
      return saved;
    }
    throw error;
  }
}

async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const saved = await caches.match(request, { ignoreVary: true });
    if (saved) {
      return saved;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigate(event));
  } else if (
    url.pathname.startsWith('/_next/static/') ||
    DOCUMENT_DOWNLOAD.test(url.pathname)
  ) {
    event.respondWith(networkFirst(request));
  }
});
