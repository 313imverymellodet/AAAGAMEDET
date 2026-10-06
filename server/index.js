// Spirebreak server: static file host + WebSocket game rooms. Zero dependencies.
//   node server/index.js            (PORT=8787 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from './ws.js';
import { onConnection, stats } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ALLOWED = [/^\/index\.html$/, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/src\/.+/, /^\/assets\/.+/];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const gzCache = new Map();

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400).end(); return; }
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  if (p === '/healthz') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, ...stats() })); return; }
  if (!ALLOWED.some((r) => r.test(p)) || p.includes('..') || p.includes('\0')) { res.writeHead(404).end('Not found'); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('Not found'); return; }
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const headers = {
      'content-type': type,
      'cache-control': p === '/index.html' || p === '/sw.js' ? 'no-cache' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    };
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|svg|manifest/.test(type);
    if (!gzip) {
      res.writeHead(200, { ...headers, 'content-length': st.size });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(file).pipe(res);
      return;
    }
    const key = file + ':' + st.mtimeMs;
    const send = (buf) => {
      res.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': buf.length, vary: 'accept-encoding' });
      res.end(req.method === 'HEAD' ? undefined : buf);
    };
    if (gzCache.has(key)) { send(gzCache.get(key)); return; }
    fs.readFile(file, (e2, data) => {
      if (e2) { res.writeHead(500).end(); return; }
      zlib.gzip(data, (e3, gz) => {
        if (e3) { res.writeHead(500).end(); return; }
        gzCache.set(key, gz);
        send(gz);
      });
    });
  });
});

attachWebSocket(server, '/ws', onConnection);

server.listen(PORT, HOST, () => {
  console.log(`Spirebreak server running at http://localhost:${PORT}  (WebSocket: /ws)`);
});
