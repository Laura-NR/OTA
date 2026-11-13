import express, { type Express } from 'express';

/**
 * Routes that take a file as base64 JSON: photos and credentials (5 MB),
 * imports, and the paper-affidavit and proof-of-transfer scans (10 MB). Base64
 * adds a third, so their bodies need more than the parser's default 100 KB.
 */
export const UPLOAD_ROUTES = [
  '/packages/:id/media',
  '/inventory/:id/media',
  '/suppliers/:id/credential',
  '/imports',
  '/reservations/:id/travelers/:travelerId/affidavit',
  '/me/reservations/:id/payments/:paymentId/proof',
];

/** A 10 MB file in base64 is about 13.4 MB of JSON. */
export const UPLOAD_BODY_LIMIT = '15mb';

/**
 * JSON parsing for the API: the upload routes take up to `UPLOAD_BODY_LIMIT`,
 * every other route keeps the default 100 KB. Registered after the Better Auth
 * handler, which must see the raw body (see main.ts).
 */
export function registerJsonParsers(app: Express): void {
  app.use(UPLOAD_ROUTES, express.json({ limit: UPLOAD_BODY_LIMIT }));
  app.use(express.json());
}
