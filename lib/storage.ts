import { cellCount, isConsistent, recountVowels, type GameState } from '@/lib/game';
import { isPuzzleSize, type DailyPuzzle, type PuzzleSize } from '@/lib/puzzle';

/**
 * v2 partitions everything by board size. The bump also retires v1 saves, whose
 * boards were written against a 4x4 dataset this version no longer ships.
 */
const STORAGE_VERSION = 2;
const NAMESPACE = `vowel-movement:v${STORAGE_VERSION}`;
const progressKey = (size: PuzzleSize, puzzleId: string) => `${NAMESPACE}:board:${size}:${puzzleId}`;
const statsKey = (size: PuzzleSize) => `${NAMESPACE}:stats:${size}`;
const SIZE_KEY = `${NAMESPACE}:size`;

/** Only the player's own moves are persisted; the puzzle itself is regenerated. */
interface SavedBoard {
  puzzleId: string;
  size: PuzzleSize;
  playerGrid: string[];
  placements: number;
  isWon: boolean;
}

export interface Stats {
  wins: number;
  currentStreak: number;
  maxStreak: number;
  lastWinNumber: number | null;
}

export const emptyStats = (): Stats => ({
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastWinNumber: null,
});

/** localStorage throws in private modes and when quota is exhausted. */
function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* progress just will not survive the refresh - not worth breaking play over */
  }
}

export function saveProgress(state: GameState): void {
  const payload: SavedBoard = {
    puzzleId: state.puzzleId,
    size: state.size,
    playerGrid: state.playerGrid,
    placements: state.placements,
    isWon: state.isWon,
  };
  writeJson(progressKey(state.size, state.puzzleId), payload);
}

/**
 * Rehydrate today's board. Anything that does not line up with today's puzzle
 * (stale save, hand-edited storage, a dataset change) is discarded rather than
 * trusted, and the bank is recomputed from the board so the two cannot drift.
 */
export function loadProgress(fresh: GameState, puzzle: DailyPuzzle): GameState {
  const saved = readJson<SavedBoard>(progressKey(puzzle.size, puzzle.puzzleId));
  if (!saved || saved.puzzleId !== puzzle.puzzleId || saved.size !== puzzle.size) return fresh;
  if (!Array.isArray(saved.playerGrid) || saved.playerGrid.length !== cellCount(puzzle.size)) {
    return fresh;
  }

  const playerGrid = saved.playerGrid.map((letter, i) =>
    typeof letter === 'string' && puzzle.consonantGrid[i] === '' ? letter.toUpperCase() : ''
  );

  const restored: GameState = {
    ...fresh,
    playerGrid,
    placements: Number.isFinite(saved.placements) ? saved.placements : 0,
  };
  if (!isConsistent(restored)) return fresh;

  return { ...restored, currentVowels: recountVowels(restored), isWon: Boolean(saved.isWon) };
}

export const loadStats = (size: PuzzleSize): Stats => readJson<Stats>(statsKey(size)) ?? emptyStats();

/**
 * Record a win once per puzzle; consecutive puzzle numbers extend the streak.
 * Streaks are per size - playing 5x5 today does not break a 4x4 run.
 */
export function recordWin(size: PuzzleSize, puzzleNumber: number): Stats {
  const stats = loadStats(size);
  if (stats.lastWinNumber === puzzleNumber) return stats;

  const currentStreak = stats.lastWinNumber === puzzleNumber - 1 ? stats.currentStreak + 1 : 1;
  const next: Stats = {
    wins: stats.wins + 1,
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    lastWinNumber: puzzleNumber,
  };
  writeJson(statsKey(size), next);
  return next;
}

/** The size the player last chose, so the app reopens where they left off. */
export function loadPreferredSize(): PuzzleSize | null {
  const saved = readJson<unknown>(SIZE_KEY);
  return isPuzzleSize(saved) ? saved : null;
}

export const savePreferredSize = (size: PuzzleSize): void => writeJson(SIZE_KEY, size);
