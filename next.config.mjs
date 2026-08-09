/**
 * Fully static export — no server, no backend. The daily puzzle is derived on
 * the client from the local calendar date, so the whole build is cacheable HTML.
 *
 * NEXT_PUBLIC_BASE_PATH lets the same build be served from a subpath such as
 * GitHub Pages' /<repo>/ without code changes.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
