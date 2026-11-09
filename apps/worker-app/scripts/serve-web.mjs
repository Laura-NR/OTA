/* global process, URL, console */
// The worker app's web preview, for screenshots and the e2e only (never
// shipped to workers): serves the `build:web` export and forwards the API
// routes the app calls to the API on the same origin, as the web apps' Next
// rewrites do. Cookies are dropped both ways: the app sends a bearer token,
// and a desk session cookie on localhost must not ride along.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist', 'web');
const port = Number(process.env.WORKER_PREVIEW_PORT ?? 3003);
const api = new URL(process.env.API_URL ?? 'http://localhost:3001');
const API_PREFIXES = ['/api/auth/', '/worker/', '/service-items/', '/health'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

function forward(req, res) {
  const headers = { ...req.headers, host: api.host };
  delete headers.cookie;
  delete headers.origin;
  delete headers.referer;
  const upstream = request(
    { host: api.hostname, port: api.port, path: req.url, method: req.method, headers },
    (answer) => {
      const out = { ...answer.headers };
      delete out['set-cookie'];
      res.writeHead(answer.statusCode ?? 502, out);
      answer.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502).end();
  });
  req.pipe(upstream);
}

function serve(req, res) {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  if (API_PREFIXES.some((prefix) => req.url?.startsWith(prefix))) forward(req, res);
  else serve(req, res);
}).listen(port, () => {
  console.log(`Worker app preview on http://localhost:${port} (API ${api.origin})`);
});
