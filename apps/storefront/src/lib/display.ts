import type { DisplayPreferences } from '@ota/domain';

/**
 * The `<html>` attributes `globals.css` keys the display modes on. Shared by
 * the server layout (first render) and the display provider (a change).
 */
export function displayAttributes(preferences: DisplayPreferences) {
  return {
    'data-text-size': preferences.largeText ? 'large' : undefined,
    'data-bandwidth': preferences.lowBandwidth ? 'low' : undefined,
  };
}
