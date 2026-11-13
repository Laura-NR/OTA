import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DISPLAY_PREFERENCES,
  isSlowConnection,
  offersLowBandwidthMode,
  offlineAssetPaths,
  offlineDocumentPath,
  offlineKitMissingDocuments,
  parseDisplayPreferences,
  parseOfflineKitEntry,
  serializeDisplayPreferences,
  type DisplayPreferences,
  type OfflineKitEntry,
} from '../src';

describe('display preferences cookie', () => {
  it('reads nothing as every preference off', () => {
    expect(parseDisplayPreferences(undefined)).toEqual(DEFAULT_DISPLAY_PREFERENCES);
    expect(parseDisplayPreferences('')).toEqual(DEFAULT_DISPLAY_PREFERENCES);
  });

  it('round-trips each combination', () => {
    const keys = Object.keys(DEFAULT_DISPLAY_PREFERENCES) as Array<
      keyof DisplayPreferences
    >;
    for (let mask = 0; mask < 1 << keys.length; mask += 1) {
      const preferences = Object.fromEntries(
        keys.map((key, index) => [key, (mask & (1 << index)) !== 0]),
      ) as unknown as DisplayPreferences;
      expect(parseDisplayPreferences(serializeDisplayPreferences(preferences))).toEqual(
        preferences,
      );
    }
  });

  it('writes an empty value when everything is off, so the cookie can go', () => {
    expect(serializeDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES)).toBe('');
  });

  it('uses only cookie-safe characters', () => {
    const value = serializeDisplayPreferences({
      largeText: true,
      reduceMotion: true,
      lowBandwidth: true,
      highContrast: true,
      bandwidthPromptDismissed: true,
    });
    expect(value).toBe('large-text.reduce-motion.low-bandwidth.high-contrast.no-prompt');
    expect(value).toMatch(/^[a-z.-]+$/);
  });

  it('ignores unknown or tampered tokens', () => {
    expect(parseDisplayPreferences('huge-text.low-bandwidth.<script>')).toEqual({
      ...DEFAULT_DISPLAY_PREFERENCES,
      lowBandwidth: true,
    });
  });

  it('keeps reduce motion and high contrast apart from the other modes', () => {
    expect(parseDisplayPreferences('reduce-motion')).toEqual({
      ...DEFAULT_DISPLAY_PREFERENCES,
      reduceMotion: true,
    });
    expect(parseDisplayPreferences('high-contrast.no-prompt')).toEqual({
      ...DEFAULT_DISPLAY_PREFERENCES,
      highContrast: true,
      bandwidthPromptDismissed: true,
    });
  });
});

describe('slow connection (DS 05: offered under 200 kbps)', () => {
  it('is slow when the reader asked the browser to save data', () => {
    expect(isSlowConnection({ saveData: true, downlinkMbps: 10 })).toBe(true);
  });

  it('is slow under 200 kbps and not at or above it', () => {
    expect(isSlowConnection({ downlinkMbps: 0.15 })).toBe(true);
    expect(isSlowConnection({ downlinkMbps: 0.2 })).toBe(false);
    expect(isSlowConnection({ downlinkMbps: 1.5 })).toBe(false);
  });

  it('is slow when the browser rates the link 2G', () => {
    expect(isSlowConnection({ effectiveType: 'slow-2g' })).toBe(true);
    expect(isSlowConnection({ effectiveType: '2g' })).toBe(true);
    expect(isSlowConnection({ effectiveType: '3g' })).toBe(false);
  });

  it('is not slow when the browser says nothing or reports 0 (unknown, offline)', () => {
    expect(isSlowConnection(undefined)).toBe(false);
    expect(isSlowConnection({})).toBe(false);
    expect(isSlowConnection({ downlinkMbps: 0 })).toBe(false);
  });

  it('offers text-only mode once, never when it is on or was declined', () => {
    const slow = { downlinkMbps: 0.1 };
    expect(offersLowBandwidthMode(DEFAULT_DISPLAY_PREFERENCES, slow)).toBe(true);
    expect(
      offersLowBandwidthMode(
        { ...DEFAULT_DISPLAY_PREFERENCES, lowBandwidth: true },
        slow,
      ),
    ).toBe(false);
    expect(
      offersLowBandwidthMode(
        { ...DEFAULT_DISPLAY_PREFERENCES, bandwidthPromptDismissed: true },
        slow,
      ),
    ).toBe(false);
    expect(offersLowBandwidthMode(DEFAULT_DISPLAY_PREFERENCES, { downlinkMbps: 5 })).toBe(
      false,
    );
  });
});

describe('offline kit', () => {
  const entry: OfflineKitEntry = {
    reservationId: 'r-1',
    bookingCode: 'DEMO0001',
    pagePath: '/en/account/reservations/r-1',
    paths: [
      '/en/account/reservations/r-1',
      offlineDocumentPath('d-1'),
      '/_next/static/chunks/main.js',
    ],
    documentCount: 1,
    savedAt: '2026-10-24T10:00:00.000Z',
    bytes: 2_400_000,
  };

  it('reads back a saved description', () => {
    expect(parseOfflineKitEntry(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
  });

  it('refuses anything that is not a kit description', () => {
    expect(parseOfflineKitEntry(null)).toBeNull();
    expect(parseOfflineKitEntry('DEMO0001')).toBeNull();
    expect(parseOfflineKitEntry({ ...entry, bytes: -1 })).toBeNull();
    expect(parseOfflineKitEntry({ ...entry, savedAt: 'yesterday' })).toBeNull();
    expect(parseOfflineKitEntry({ ...entry, paths: ['https://evil.test/x'] })).toBeNull();
    expect(parseOfflineKitEntry({ ...entry, pagePath: 'account' })).toBeNull();
  });

  it('links documents through the download route the trip page uses', () => {
    expect(offlineDocumentPath('d-9')).toBe('/api/ota/documents/d-9/download');
  });

  it('lists the documents issued since the kit was saved', () => {
    expect(offlineKitMissingDocuments(entry, ['d-1'])).toEqual([]);
    expect(offlineKitMissingDocuments(entry, ['d-1', 'd-2'])).toEqual(['d-2']);
  });

  it('finds the build assets a saved page needs, in tags and in the React payload', () => {
    const html = [
      '<link rel="stylesheet" href="/_next/static/css/app.css?v=1&amp;x=2">',
      '<script src="/_next/static/chunks/webpack.js" async></script>',
      '<link rel="preload" href="/_next/static/media/Inter.woff2" as="font">',
      '<script>self.__next_f.push([1,"3:I[\\"static/chunks/app/%5Blocale%5D/page.js\\"]"])</script>',
      '<script src="/_next/static/chunks/webpack.js"></script>',
      '<img src="/api/ota/catalog/media/1">',
      // The React payload split mid-path across two script tags.
      '<script>self.__next_f.push([1,"[\\"static/chunks/app-pag"])</script>',
    ].join('');
    expect(offlineAssetPaths(html)).toEqual([
      '/_next/static/css/app.css?v=1&x=2',
      '/_next/static/chunks/webpack.js',
      '/_next/static/media/Inter.woff2',
      '/_next/static/chunks/app/%5Blocale%5D/page.js',
    ]);
  });
});
