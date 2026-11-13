/**
 * The passport key (a 32-byte Buffer, or null when PASSPORT_ENCRYPTION_KEY is
 * unset). Kept in its own file for the same reason as PAYMENT_PROVIDERS: a
 * token imported from the module into the service resolves to `undefined`.
 */
export const PASSPORT_KEY = 'ota:passport-key';
