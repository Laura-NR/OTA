/**
 * Injection token for the flags the deployment holds off whatever the settings
 * say (A4, 2026-11-09). Kept in its own file, like the other tokens, so the
 * module and the service never import each other.
 */
export const HELD_OFF_FEATURES = 'ota:held-off-features';
