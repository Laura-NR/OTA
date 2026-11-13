import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { registerJsonParsers } from '../src/common/json-body';

function app() {
  const server = express();
  registerJsonParsers(server);
  server.use((req, res) => {
    res.json({ bytes: JSON.stringify(req.body).length });
  });
  return server;
}

/** A JSON body carrying `kb` kilobytes of base64, as the upload routes take files. */
function body(kb: number) {
  return { contentType: 'image/png', contentBase64: 'A'.repeat(kb * 1024) };
}

describe('JSON body limits', () => {
  it('lets an upload route take a file larger than the default 100 KB', async () => {
    for (const path of [
      '/packages/1/media',
      '/inventory/1/media',
      '/suppliers/1/credential',
      '/imports',
      '/reservations/1/travelers/2/affidavit',
      '/me/reservations/1/payments/2/proof',
    ]) {
      const response = await request(app()).post(path).send(body(200));
      expect(response.status, path).toBe(200);
    }
  });

  it('keeps the default limit everywhere else', async () => {
    const response = await request(app()).post('/reservations').send(body(200));
    expect(response.status).toBe(413);
  });

  it('refuses a body past the upload limit (a 10 MB scan fits, 16 MB does not)', async () => {
    const scan = await request(app())
      .post('/me/reservations/1/payments/2/proof')
      .send(body(13_700));
    expect(scan.status).toBe(200);

    const tooLarge = await request(app())
      .post('/me/reservations/1/payments/2/proof')
      .send(body(16 * 1024));
    expect(tooLarge.status).toBe(413);
  });
});
