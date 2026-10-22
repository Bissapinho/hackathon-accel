// Minimal web client server: serves apps/web/public and proxies /api to the Mini-Foundry server, so the
// login cookie stays same-origin and SSE streams pass through untouched. No dependencies.
//   API_URL=http://127.0.0.1:4000 WEB_PORT=5173 node apps/web/serve.mjs
import { createReadStream, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = new URL(process.env.API_URL ?? 'http://127.0.0.1:4000');
const PORT = Number(process.env.WEB_PORT ?? 5173);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const up = http.request(
        { hostname: API.hostname, port: API.port || 80, path: req.url, method: req.method, headers: { ...req.headers, host: API.host } },
        (r) => {
          res.writeHead(r.statusCode ?? 502, r.headers);
          r.pipe(res);
        },
      );
      up.on('error', () => {
        if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 'SERVER_DOWN', message: `The server at ${API.origin} is not answering.`, hint: 'Start it with pnpm dev.' }));
      });
      res.on('close', () => { if (!res.writableEnded) up.destroy(); });
      req.pipe(up);
      return;
    }
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    try {
      if (statSync(file).isDirectory()) file = path.join(file, 'index.html');
    } catch {
      file = path.join(ROOT, 'index.html');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
    createReadStream(file).on('error', () => res.end()).pipe(res);
  })
  .listen(PORT, () => console.log(`web: http://localhost:${PORT}  (api → ${API.origin})`));
