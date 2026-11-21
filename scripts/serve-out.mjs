/**
 * Tiny static server for the exported site (`out/`), for measuring and for the e2e smoke test.
 * Behaves like a CDN: compresses text responses with gzip (compressed once, then served from memory),
 * sends ETag and Cache-Control (same rules as vercel.json), answers 304 on a matching If-None-Match.
 *
 *   node scripts/serve-out.mjs [port] [dir]        (defaults: 4173, out)
 * Also importable: `import { startServer } from './serve-out.mjs'`.
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg']);

function cacheControl(urlPath) {
  if (urlPath.startsWith('/_next/static/')) return 'public, max-age=31536000, immutable';
  return 'public, max-age=0, must-revalidate';
}

export function startServer({ port = 4173, dir = 'out', host = '127.0.0.1' } = {}) {
  const root = resolve(dir);
  const cache = new Map();

  async function load(file) {
    const hit = cache.get(file);
    if (hit) return hit;
    const raw = await readFile(file);
    const ext = extname(file);
    const gz = COMPRESSIBLE.has(ext) ? gzipSync(raw, { level: 9 }) : null;
    const entry = { raw, gz, type: TYPES[ext] ?? 'application/octet-stream', etag: `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"` };
    cache.set(file, entry);
    return entry;
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let urlPath = decodeURIComponent(url.pathname);
      if (urlPath.endsWith('/')) urlPath += 'index.html';
      const file = normalize(join(root, urlPath));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let target = file;
      const info = await stat(target).catch(() => null);
      if (info?.isDirectory()) target = join(target, 'index.html');
      else if (!info && !extname(target)) target += '.html';
      const entry = await load(target).catch(() => null);
      if (!entry) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      const headers = { 'content-type': entry.type, etag: entry.etag, 'cache-control': cacheControl(urlPath), vary: 'Accept-Encoding' };
      if (req.headers['if-none-match'] === entry.etag) {
        res.writeHead(304, headers).end();
        return;
      }
      const useGzip = entry.gz !== null && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
      const body = useGzip ? entry.gz : entry.raw;
      if (useGzip) headers['content-encoding'] = 'gzip';
      headers['content-length'] = String(body.length);
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      res.writeHead(500).end('Server error');
    }
  });
  return new Promise((done) => server.listen(port, host, () => done({ server, port: server.address().port, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4173);
  const { port: bound } = await startServer({ port, dir: process.argv[3] ?? 'out' });
  console.log(`Serving ${process.argv[3] ?? 'out'} on http://127.0.0.1:${bound}`);
}
