/**
 * Serves the static export in `out/` over the LAN so the real build can be
 * opened on a phone.
 *
 * Reason it exists rather than "use any static server": the dev server refuses
 * cross-origin requests for `/_next/*` (see allowedDevOrigins in
 * next.config.mjs), and several ad-hoc servers on Windows label .js as
 * text/plain, which WebKit will not execute. Either way the page arrives
 * styled but dead. This serves the real files with explicit MIME types.
 *
 *   npm run build && npm run preview
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd(), 'out');
const PORT = Number(process.env.PORT ?? 5000);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

if (!existsSync(ROOT)) {
  console.error('No out/ directory - run `npm run build` first.');
  process.exit(1);
}

/** Resolve a request path inside out/, refusing anything that escapes it. */
function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = resolve(ROOT, `.${normalize(decoded)}`);
  if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;

  for (const candidate of [target, join(target, 'index.html'), `${target}.html`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

createServer((req, res) => {
  const file = resolveFile(req.url ?? '/') ?? resolveFile('/404.html');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }

  res.writeHead(file.endsWith('404.html') ? 404 : 200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  const addresses = Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => `  http://${entry.address}:${PORT}`);

  console.log(`Serving out/ on\n  http://localhost:${PORT}`);
  if (addresses.length) console.log(`${addresses.join('\n')}   <- open this one on your phone`);
});
