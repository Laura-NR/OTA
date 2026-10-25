import type { DisplayPreferences } from '@ota/domain';

/**
 * The `<html>` attributes `globals.css` keys the display modes on. Shared by
 * the server layout (first render) and the display provider (a change).
 */
export function displayAttributes(preferences: DisplayPreferences) {
  return {
    'data-text-size': preferences.largeText ? 'large' : undefined,
    'data-motion': preferences.reduceMotion ? 'reduce' : undefined,
    'data-bandwidth': preferences.lowBandwidth ? 'low' : undefined,
    'data-contrast': preferences.highContrast ? 'more' : undefined,
  };
}

/**
 * Whether to skip a scripted animation (a smooth scroll): the reader asked for
 * reduced motion here or in the system settings. CSS cannot stop a scroll a
 * script asks to be smooth. Browser only.
 */
export function prefersReducedMotion(): boolean {
  return (
    document.documentElement.getAttribute('data-motion') === 'reduce' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
