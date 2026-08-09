import { CELL_COUNT, isConsistent, recountVowels, type GameState } from '@/lib/game';
import type { DailyPuzzle } from '@/lib/puzzle';

const STORAGE_VERSION = 1;
const progressKey = (puzzleId: string) => `vowel-movement:v${STORAGE_VERSION}:board:${puzzleId}`;
const STATS_KEY = `vowel-movement:v${STORAGE_VERSION}:stats`;

/** Only the player's own moves are persisted; the puzzle itself is regenerated. */
interface SavedBoard {
  puzzleId: string;
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
    playerGrid: state.playerGrid,
    placements: state.placements,
    isWon: state.isWon,
  };
  writeJson(progressKey(state.puzzleId), payload);
}

/**
 * Rehydrate today's board. Anything that does not line up with today's puzzle
 * (stale save, hand-edited storage, a dataset change) is discarded rather than
 * trusted, and the bank is recomputed from the board so the two cannot drift.
 */
export function loadProgress(fresh: GameState, puzzle: DailyPuzzle): GameState {
  const saved = readJson<SavedBoard>(progressKey(puzzle.puzzleId));
  if (!saved || saved.puzzleId !== puzzle.puzzleId) return fresh;
  if (!Array.isArray(saved.playerGrid) || saved.playerGrid.length !== CELL_COUNT) return fresh;

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

export const loadStats = (): Stats => readJson<Stats>(STATS_KEY) ?? emptyStats();

/** Record a win once per puzzle; consecutive puzzle numbers extend the streak. */
export function recordWin(puzzleNumber: number): Stats {
  const stats = loadStats();
  if (stats.lastWinNumber === puzzleNumber) return stats;

  const currentStreak = stats.lastWinNumber === puzzleNumber - 1 ? stats.currentStreak + 1 : 1;
  const next: Stats = {
    wins: stats.wins + 1,
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    lastWinNumber: puzzleNumber,
  };
  writeJson(STATS_KEY, next);
  return next;
}
