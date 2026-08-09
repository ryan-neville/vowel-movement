/**
 * Teaches Node the `@/*` path alias and TypeScript's extensionless imports, so
 * `node --test` can load the very same modules the bundler does with no build
 * step in between.
 */
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_URL = pathToFileURL(`${ROOT}/`);
const EXTENSIONS = ['.ts', '.tsx', '.mjs', '.js', '.json'];

/** Bundler-style resolution: bare path, then each candidate extension. */
function resolveFile(url) {
  const filePath = fileURLToPath(url);
  if (path.extname(filePath) && fs.existsSync(filePath)) return url;
  for (const extension of EXTENSIONS) {
    if (fs.existsSync(filePath + extension)) return pathToFileURL(filePath + extension).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const resolved = resolveFile(new URL(specifier.slice(2), ROOT_URL).href);
      if (resolved) return nextResolve(resolved, context);
    }
    return nextResolve(specifier, context);
  },
});
