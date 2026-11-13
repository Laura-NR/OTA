import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Writable } from 'node:stream';

import pinoHttp from 'pino-http';
import { afterEach, describe, expect, it } from 'vitest';

import { httpLoggerOptions } from '../src/app.module';

const SESSION = 'better-auth.session_token=secret-session-token.signature';
const BEARER = 'Bearer secret-bearer-token';

/**
 * Logs one request through the API's request-logger options (at info level and
 * without the pretty transport, so the JSON line is captured) and returns it.
 */
async function logOneRequest(): Promise<Record<string, unknown>> {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  const logger = pinoHttp(
    { ...httpLoggerOptions, level: 'info', transport: undefined },
    sink,
  );
  server = createServer((req, res) => {
    logger(req, res);
    res.setHeader('set-cookie', `${SESSION}; Path=/; HttpOnly`);
    res.end('ok');
  });
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  await fetch(`http://127.0.0.1:${port}/me`, {
    headers: { cookie: SESSION, authorization: BEARER },
  });
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  return JSON.parse(lines[0]!) as Record<string, unknown>;
}

let server: Server | undefined;

afterEach(async () => {
  await new Promise((resolve) => server?.close(resolve));
  server = undefined;
});

describe('API request log', () => {
  it('carries no session token, bearer token or set-cookie value', async () => {
    const entry = await logOneRequest();
    const text = JSON.stringify(entry);

    expect(text).not.toContain('secret-session-token');
    expect(text).not.toContain('secret-bearer-token');
    const req = entry.req as { headers: Record<string, unknown> };
    const res = entry.res as { headers: Record<string, unknown> };
    expect(req.headers.cookie).toBe('[Redacted]');
    expect(req.headers.authorization).toBe('[Redacted]');
    expect(res.headers['set-cookie']).toBe('[Redacted]');
  });

  it('still logs the request line', async () => {
    const entry = await logOneRequest();
    expect(entry.req).toMatchObject({ method: 'GET', url: '/me' });
    expect(entry.res).toMatchObject({ statusCode: 200 });
  });
});
