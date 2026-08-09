import puzzleData from '@/data/puzzles.json' with { type: 'json' };
import { daysSinceLaunch, toDateKey } from '@/lib/date';
import { dateToSeed, seededShuffle } from '@/lib/random';

/** Raw dataset row: `c` is the 16-cell skeleton ('.' = blank), `v` the bank. */
type PuzzleRecord = { c: string; v: string };

const PUZZLES = puzzleData as PuzzleRecord[];

export const VOWELS = ['A', 'E', 'I', 'O', 'U'] as const;
export type Vowel = (typeof VOWELS)[number];

export type VowelCounts = Record<Vowel, number>;

export interface DailyPuzzle {
  /** Local calendar date, e.g. "2026-08-09". */
  puzzleId: string;
  /** 1-based puzzle number shown in the header and share text. */
  puzzleNumber: number;
  /** Index into the static dataset - useful for debugging a reported grid. */
  datasetIndex: number;
  /** Length 16. Consonants in fixed cells, '' where the player must fill in. */
  consonantGrid: string[];
  /** The 8 vowel tokens available today, as counts per letter. */
  initialVowels: VowelCounts;
}

export const emptyVowelCounts = (): VowelCounts => ({ A: 0, E: 0, I: 0, O: 0, U: 0 });

export function isVowel(letter: string): letter is Vowel {
  return (VOWELS as readonly string[]).includes(letter);
}

/**
 * Which dataset row belongs to a given date.
 *
 * A plain `seed % length` would repeat puzzles at random within weeks. Instead
 * each pass through the dataset is a fresh seeded shuffle, so every puzzle is
 * played once before any repeats - while staying a pure function of the date.
 */
export function puzzleIndexForDate(dateKey: string): number {
  const total = PUZZLES.length;
  const dayIndex = daysSinceLaunch(dateKey);
  const cycle = Math.floor(dayIndex / total);
  const slot = ((dayIndex % total) + total) % total;
  const order = seededShuffle(
    Array.from({ length: total }, (_, i) => i),
    dateToSeed(`vowel-movement/cycle/${cycle}`)
  );
  return order[slot];
}

export function getPuzzleForDate(dateKey: string = toDateKey()): DailyPuzzle {
  const datasetIndex = puzzleIndexForDate(dateKey);
  const record = PUZZLES[datasetIndex];

  const consonantGrid = [...record.c].map((cell) => (cell === '.' ? '' : cell));
  const initialVowels = emptyVowelCounts();
  for (const letter of record.v) {
    if (isVowel(letter)) initialVowels[letter] += 1;
  }

  return {
    puzzleId: dateKey,
    puzzleNumber: daysSinceLaunch(dateKey) + 1,
    datasetIndex,
    consonantGrid,
    initialVowels,
  };
}

export const PUZZLE_COUNT = PUZZLES.length;
