import { isWord } from '@/lib/dictionary';
import {
  emptyVowelCounts,
  isVowel,
  type DailyPuzzle,
  type Vowel,
  type VowelCounts,
} from '@/lib/puzzle';

export const GRID_SIZE = 4;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

export interface GameState {
  puzzleId: string;
  puzzleNumber: number;
  /** Length 16, '' where the player must place a vowel. */
  consonantGrid: string[];
  /** Length 16, '' except where the player has placed a vowel. */
  playerGrid: string[];
  /** The day's bank as dealt. */
  initialVowels: VowelCounts;
  /** What is still spendable. */
  currentVowels: VowelCounts;
  /** How many placements the player has made (their efficiency score). */
  placements: number;
  isWon: boolean;
}

export type LineStatus = 'empty' | 'partial' | 'valid' | 'invalid';

export interface LineResult {
  status: LineStatus;
  word: string;
}

export interface BoardEvaluation {
  rows: LineResult[];
  columns: LineResult[];
  isComplete: boolean;
  isWon: boolean;
}

export function createGameState(puzzle: DailyPuzzle): GameState {
  return {
    puzzleId: puzzle.puzzleId,
    puzzleNumber: puzzle.puzzleNumber,
    consonantGrid: [...puzzle.consonantGrid],
    playerGrid: Array<string>(CELL_COUNT).fill(''),
    initialVowels: { ...puzzle.initialVowels },
    currentVowels: { ...puzzle.initialVowels },
    placements: 0,
    isWon: false,
  };
}

/** The board as the player sees it: fixed consonants merged with placed vowels. */
export function mergedGrid(state: GameState): string[] {
  return state.consonantGrid.map((consonant, i) => consonant || state.playerGrid[i]);
}

export const cellIndex = (row: number, column: number) => row * GRID_SIZE + column;
export const rowOf = (index: number) => Math.floor(index / GRID_SIZE);
export const columnOf = (index: number) => index % GRID_SIZE;

/** A cell is playable when the puzzle left it blank. */
export const isBlankCell = (state: GameState, index: number) => state.consonantGrid[index] === '';

function evaluateLine(letters: string[]): LineResult {
  const filled = letters.filter(Boolean).length;
  const word = letters.join('');
  if (filled === 0) return { status: 'empty', word: '' };
  if (filled < GRID_SIZE) return { status: 'partial', word };
  return { status: isWord(word) ? 'valid' : 'invalid', word };
}

/**
 * Re-scores all 8 lines. Cheap enough (8 Set lookups) to run on every drop,
 * which is what gives the board its instant red/green feedback.
 */
export function evaluateBoard(state: GameState): BoardEvaluation {
  const grid = mergedGrid(state);
  const rows: LineResult[] = [];
  const columns: LineResult[] = [];

  for (let i = 0; i < GRID_SIZE; i++) {
    rows.push(evaluateLine(grid.slice(i * GRID_SIZE, i * GRID_SIZE + GRID_SIZE)));
    columns.push(
      evaluateLine(Array.from({ length: GRID_SIZE }, (_, r) => grid[cellIndex(r, i)]))
    );
  }

  const isComplete = grid.every(Boolean);
  const isWon =
    isComplete &&
    rows.every((line) => line.status === 'valid') &&
    columns.every((line) => line.status === 'valid');

  return { rows, columns, isComplete, isWon };
}

const withWinFlag = (state: GameState): GameState => ({
  ...state,
  isWon: evaluateBoard(state).isWon,
});

/**
 * Put `letter` into `index`, returning any vowel already sitting there to the
 * bank. No-ops when the cell is locked or the token is out of stock.
 */
export function placeVowel(state: GameState, index: number, letter: Vowel): GameState {
  if (!isBlankCell(state, index)) return state;

  const displaced = state.playerGrid[index];
  if (displaced === letter) return state;

  const currentVowels: VowelCounts = { ...state.currentVowels };
  if (displaced && isVowel(displaced)) currentVowels[displaced] += 1;
  if (currentVowels[letter] <= 0) return state;
  currentVowels[letter] -= 1;

  const playerGrid = [...state.playerGrid];
  playerGrid[index] = letter;

  return withWinFlag({
    ...state,
    playerGrid,
    currentVowels,
    placements: state.placements + 1,
  });
}

/** Send the vowel in `index` back to the bank. */
export function removeVowel(state: GameState, index: number): GameState {
  const letter = state.playerGrid[index];
  if (!letter || !isVowel(letter)) return state;

  const playerGrid = [...state.playerGrid];
  playerGrid[index] = '';

  return withWinFlag({
    ...state,
    playerGrid,
    currentVowels: { ...state.currentVowels, [letter]: state.currentVowels[letter] + 1 },
  });
}

/** Drag a placed vowel to another blank cell, swapping if the target is taken. */
export function moveVowel(state: GameState, from: number, to: number): GameState {
  if (from === to) return state;
  const letter = state.playerGrid[from];
  if (!letter || !isBlankCell(state, to)) return state;

  const playerGrid = [...state.playerGrid];
  playerGrid[from] = playerGrid[to];
  playerGrid[to] = letter;

  return withWinFlag({ ...state, playerGrid, placements: state.placements + 1 });
}

/** Clear the board back to the day's opening position. */
export function resetBoard(state: GameState): GameState {
  return {
    ...state,
    playerGrid: Array<string>(CELL_COUNT).fill(''),
    currentVowels: { ...state.initialVowels },
    placements: 0,
    isWon: false,
  };
}

/** Rebuild the bank from the board - used when restoring a saved game. */
export function recountVowels(state: GameState): VowelCounts {
  const remaining: VowelCounts = { ...state.initialVowels };
  for (const letter of state.playerGrid) {
    if (letter && isVowel(letter)) remaining[letter] -= 1;
  }
  return remaining;
}

/** True when a restored board is internally consistent with the day's bank. */
export function isConsistent(state: GameState): boolean {
  const counts = recountVowels(state);
  return Object.values(counts).every((n) => n >= 0);
}

export const totalVowels = (counts: VowelCounts): number =>
  Object.values(counts).reduce((sum, n) => sum + n, 0);

export const emptyCounts = emptyVowelCounts;
