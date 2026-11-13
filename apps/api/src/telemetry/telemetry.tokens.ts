/**
 * Injection token for the analytics sink. Keep it in its own file: importing
 * it from the module into the service can create a circular import that
 * resolves the token to `undefined` (same trap as PAYMENT_PROVIDERS).
 */
export const TELEMETRY_SINK = 'ota:telemetry-sink';
