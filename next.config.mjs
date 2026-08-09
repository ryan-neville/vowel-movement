import { hostname, networkInterfaces } from 'node:os';

/**
 * Fully static export — no server, no backend. The daily puzzle is derived on
 * the client from the local calendar date, so the whole build is cacheable HTML.
 *
 * NEXT_PUBLIC_BASE_PATH lets the same build be served from a subpath such as
 * GitHub Pages' /<repo>/ without code changes.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Hosts allowed to request `/_next/*` from the dev server.
 *
 * Next serves the React and application chunks with `crossorigin`, so the
 * browser sends an `Origin` header for them. In development anything outside
 * this allowlist gets a 403, and because stylesheets carry no `crossorigin`
 * the page still arrives fully styled - it simply never hydrates. Opening the
 * dev server from a phone on the LAN (`http://192.168.x.x:3000`) hits exactly
 * that: a permanent "Loading today's grid..." with no visible error.
 *
 * The machine's own LAN addresses are detected at startup so a real device can
 * load the dev server without hand-editing this file; NEXT_DEV_ORIGINS adds
 * anything else (a tunnel hostname, say) as a comma-separated list.
 *
 * Development only - `output: 'export'` ships plain files with no such check.
 */
function devOrigins() {
  const origins = new Set(['localhost', '127.0.0.1', hostname(), `${hostname()}.local`]);

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal) continue;
      origins.add(address.address);
      // Origin headers carry IPv6 literals in brackets.
      if (address.family === 'IPv6') origins.add(`[${address.address}]`);
    }
  }

  for (const extra of (process.env.NEXT_DEV_ORIGINS ?? '').split(',')) {
    if (extra.trim()) origins.add(extra.trim());
  }

  return [...origins];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  allowedDevOrigins: devOrigins(),
};

export default nextConfig;
