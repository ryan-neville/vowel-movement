import { registerDictionary } from '@/lib/dictionary';
import { hasPuzzles, registerPuzzles, type PuzzleRecord, type PuzzleSize } from '@/lib/puzzle';

/**
 * On-demand datasets, one chunk per board size.
 *
 * The four dictionaries come to roughly three quarters of a megabyte between
 * them, which is more than the rest of the application put together, so they are
 * not bundled into the first paint. Each size is a separate dynamic import: the
 * bundler emits it as its own chunk, and a visitor who only ever plays 4x4 never
 * downloads the 7-letter word list.
 *
 * The static literals below are deliberate - a computed `import(`.../size${n}`)`
 * would leave the bundler guessing at what to split out.
 */
const chunks: Record<PuzzleSize, () => Promise<{ puzzles: PuzzleRecord[]; words: string[] }>> = {
  4: () => import('@/data/size4').then((chunk) => chunk.default),
  5: () => import('@/data/size5').then((chunk) => chunk.default),
  6: () => import('@/data/size6').then((chunk) => chunk.default),
  7: () => import('@/data/size7').then((chunk) => chunk.default),
};

/** In flight or settled, keyed by size, so a size is never fetched twice. */
const requests = new Map<PuzzleSize, Promise<void>>();

export function loadSize(size: PuzzleSize): Promise<void> {
  const existing = requests.get(size);
  if (existing) return existing;

  const request = chunks[size]().then(({ puzzles, words }) => {
    registerPuzzles(size, puzzles);
    registerDictionary(size, words);
  });

  // A failed fetch must not be cached as "done", or the size stays broken for
  // the rest of the session even once the network comes back.
  request.catch(() => requests.delete(size));
  requests.set(size, request);
  return request;
}

export const isSizeLoaded = (size: PuzzleSize): boolean => hasPuzzles(size);
