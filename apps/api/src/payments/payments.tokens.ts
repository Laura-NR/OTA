/**
 * Rail -> provider map (spec §7.1). Kept in its own file: importing a token from
 * the module into the service creates a circular import that resolves the token
 * to `undefined` and breaks Nest DI.
 */
export const PAYMENT_PROVIDERS = 'ota:payment-providers';
