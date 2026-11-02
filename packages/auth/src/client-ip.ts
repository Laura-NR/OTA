/**
 * The header the API writes on every request it hands to Better Auth, from
 * Express's `req.ip` under `TRUST_PROXY` (`docs/schema-m9-ip-allowlist.md`
 * I2). Better Auth reads a session's address only from it, so an
 * `X-Forwarded-For` a client wrote itself never becomes that address.
 */
export const CLIENT_IP_HEADER = 'x-ota-client-ip';

/** Better Auth's `advanced.ipAddress` for the header above. */
export const CLIENT_IP_ADDRESS_OPTIONS = { ipAddressHeaders: [CLIENT_IP_HEADER] };
