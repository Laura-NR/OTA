import type { IncomingHttpHeaders } from 'node:http';

/**
 * Write the client's address, as Express resolved it under `TRUST_PROXY`,
 * into `header` for Better Auth, replacing any value the client sent
 * (`docs/schema-m9-ip-allowlist.md` I2). With no address the header goes, so
 * Better Auth records none rather than one the client chose.
 */
export function writeClientIp(
  headers: IncomingHttpHeaders,
  header: string,
  ip: string | undefined,
): void {
  if (ip) {
    headers[header] = ip;
  } else {
    delete headers[header];
  }
}
