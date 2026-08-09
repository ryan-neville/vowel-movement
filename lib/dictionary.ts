import words from '@/data/words4.json' with { type: 'json' };

/**
 * Every 4-letter word the game accepts. Bundled as a static array so validation
 * is a local Set lookup with no network round trip.
 */
const DICTIONARY = new Set(words as string[]);

export function isWord(candidate: string): boolean {
  return DICTIONARY.has(candidate.toLowerCase());
}

export const DICTIONARY_SIZE = DICTIONARY.size;
