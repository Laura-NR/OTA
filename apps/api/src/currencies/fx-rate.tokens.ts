/**
 * Display-currency tokens (`docs/schema-m9-display-currencies.md` C3, C5).
 * Kept in their own file: importing a token from the module into the service
 * creates a circular import that resolves the token to `undefined`.
 */
export const FX_RATE_PROVIDER = 'ota:fx-rate-provider';
export const FX_RATE_SCHEDULER = 'ota:fx-rate-scheduler';
