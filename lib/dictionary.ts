/**
 * The words the game accepts, one Set per word length.
 *
 * Each board size ships its own list and they are big - the 7-letter list alone
 * is 33,000 words - so they are fetched on demand by `lib/data` and registered
 * here rather than bundled into the first paint. Validation itself stays what it
 * always was: a local Set lookup with no network round trip.
 */
const dictionaries = new Map<number, Set<string>>();

export function registerDictionary(size: number, words: string[]): void {
  if (!dictionaries.has(size)) dictionaries.set(size, new Set(words));
}

/** True when `candidate` is a real word of its own length. */
export function isWord(candidate: string): boolean {
  return dictionaries.get(candidate.length)?.has(candidate.toLowerCase()) ?? false;
}

export const dictionarySize = (size: number): number => dictionaries.get(size)?.size ?? 0;
