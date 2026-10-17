import type { Response } from 'express';

/** Stream a stored proposal PDF inline; it carries personal data, so it is never cached. */
export function sendPdf(response: Response, body: Uint8Array, filename: string): void {
  response.setHeader('content-type', 'application/pdf');
  response.setHeader('content-disposition', `inline; filename="${filename}"`);
  response.setHeader('cache-control', 'no-store');
  response.send(Buffer.from(body));
}
