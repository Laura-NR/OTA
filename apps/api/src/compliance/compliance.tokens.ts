/**
 * The tenant's legal texts by locale (`content.legal` in tenant messages).
 * Kept in its own file so the module and the service can both import it
 * without a circular import resolving the token to `undefined`.
 */
export const LEGAL_CONTENT = 'ota:legal-content';
