import { daysSinceLaunch, toDateKey } from '@/lib/date';
import { dateToSeed, seededShuffle } from '@/lib/random';

/** The board sizes that ship a dataset. Each runs its own daily sequence. */
export const SIZES = [4, 5, 6, 7] as const;
export type PuzzleSize = (typeof SIZES)[number];
export const DEFAULT_SIZE: PuzzleSize = 4;

export function isPuzzleSize(value: unknown): value is PuzzleSize {
  return (SIZES as readonly unknown[]).includes(value);
}

/** Raw dataset row: `c` is the size x size skeleton ('.' = blank), `v` the bank. */
export interface PuzzleRecord {
  c: string;
  v: string;
}

export const VOWELS = ['A', 'E', 'I', 'O', 'U'] as const;
export type Vowel = (typeof VOWELS)[number];

export type VowelCounts = Record<Vowel, number>;

export interface DailyPuzzle {
  /** Local calendar date, e.g. "2026-08-09". */
  puzzleId: string;
  /** Board size this puzzle was drawn for. */
  size: PuzzleSize;
  /** 1-based puzzle number shown in the header and share text. */
  puzzleNumber: number;
  /** Index into the static dataset - useful for debugging a reported grid. */
  datasetIndex: number;
  /** Length size x size. Consonants in fixed cells, '' where the player fills in. */
  consonantGrid: string[];
  /** The vowel tokens available today, as counts per letter. */
  initialVowels: VowelCounts;
}

export const emptyVowelCounts = (): VowelCounts => ({ A: 0, E: 0, I: 0, O: 0, U: 0 });

export function isVowel(letter: string): letter is Vowel {
  return (VOWELS as readonly string[]).includes(letter);
}

/**
 * Datasets are fetched per size rather than bundled together - the four
 * dictionaries alone are most of a megabyte, and a visitor playing 4x4 should
 * never pay for the 7x7 word list. `lib/data` fills this in on demand.
 */
const datasets = new Map<PuzzleSize, PuzzleRecord[]>();

export function registerPuzzles(size: PuzzleSize, records: PuzzleRecord[]): void {
  datasets.set(size, records);
}

export function puzzleCount(size: PuzzleSize): number {
  return datasets.get(size)?.length ?? 0;
}

export const hasPuzzles = (size: PuzzleSize): boolean => datasets.has(size);

/**
 * Which dataset row belongs to a given date.
 *
 * A plain `seed % length` would repeat puzzles at random within weeks. Instead
 * each pass through the dataset is a fresh seeded shuffle, so every puzzle is
 * played once before any repeats - while staying a pure function of the date.
 * The size is part of the seed, so the four sequences do not move in lockstep.
 */
export function puzzleIndexForDate(dateKey: string, size: PuzzleSize): number {
  const total = puzzleCount(size);
  if (total === 0) throw new Error(`No ${size}x${size} puzzles have been loaded`);

  const dayIndex = daysSinceLaunch(dateKey);
  const cycle = Math.floor(dayIndex / total);
  const slot = ((dayIndex % total) + total) % total;
  const order = seededShuffle(
    Array.from({ length: total }, (_, i) => i),
    dateToSeed(`vowel-movement/${size}/cycle/${cycle}`)
  );
  return order[slot];
}

export function getPuzzleForDate(
  dateKey: string = toDateKey(),
  size: PuzzleSize = DEFAULT_SIZE
): DailyPuzzle {
  const datasetIndex = puzzleIndexForDate(dateKey, size);
  const record = datasets.get(size)![datasetIndex];

  const consonantGrid = [...record.c].map((cell) => (cell === '.' ? '' : cell));
  const initialVowels = emptyVowelCounts();
  for (const letter of record.v) {
    if (isVowel(letter)) initialVowels[letter] += 1;
  }

  return {
    puzzleId: dateKey,
    size,
    puzzleNumber: daysSinceLaunch(dateKey) + 1,
    datasetIndex,
    consonantGrid,
    initialVowels,
  };
}
