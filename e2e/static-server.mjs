/**
 * Minimal static server for the built site, used only by Playwright.
 *
 * `astro preview` is not usable here: the project builds through
 * `@astrojs/vercel`, and an adapter owns preview. Serving `dist/client`
 * directly is also closer to what Vercel actually does with a static build,
 * and it keeps the e2e run free of another dependency.
 *
 * Range requests are supported because the hero is a video: without them
 * Chromium cannot seek, and #23 AC-4 is a claim about the video working.
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[2] ?? 'dist/client');
const PORT = Number(process.env.PORT ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Resolve a URL path to a file inside ROOT, or null. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  // normalize collapses any ../ before the prefix check below.
  const candidate = resolve(join(ROOT, normalize(decoded)));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + sep)) return null;

  for (const path of [candidate, join(candidate, 'index.html'), `${candidate}.html`]) {
    try {
      if (statSync(path).isFile()) return path;
    } catch {
      // try the next shape
    }
  }
  return null;
}

createServer((req, res) => {
  const file = resolveFile(req.url ?? '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const { size } = statSync(file);
  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : size - 1;
      if (start < size && end < size && start <= end) {
        res.writeHead(206, {
          'content-type': type,
          'content-length': end - start + 1,
          'content-range': `bytes ${start}-${end}/${size}`,
          'accept-ranges': 'bytes',
        });
        createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }
  }

  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes' });
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`static server on http://localhost:${PORT} serving ${ROOT}`);
});
