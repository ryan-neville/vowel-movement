import assert from 'node:assert/strict';
import test, { before } from 'node:test';

import size4 from '@/data/size4';
import size5 from '@/data/size5';
import size6 from '@/data/size6';
import size7 from '@/data/size7';
import { toDateKey, daysSinceLaunch, LAUNCH_DATE } from '@/lib/date';
import { loadSize } from '@/lib/data';
import { isWord } from '@/lib/dictionary';
import {
  cellCount,
  createGameState,
  evaluateBoard,
  lineCount,
  mergedGrid,
  moveVowel,
  placeVowel,
  recountVowels,
  removeVowel,
  resetBoard,
  totalVowels,
  type GameState,
} from '@/lib/game';
import {
  DEFAULT_SIZE,
  SIZES,
  getPuzzleForDate,
  puzzleCount,
  puzzleIndexForDate,
  type PuzzleSize,
} from '@/lib/puzzle';
import { buildShareText } from '@/lib/share';

const TODAY = '2026-08-09';

/** Every size's dataset, so the tests exercise the data the app really loads. */
before(async () => {
  await Promise.all(SIZES.map((size) => loadSize(size)));
});

const todaysGame = (size: PuzzleSize = DEFAULT_SIZE): GameState =>
  createGameState(getPuzzleForDate(TODAY, size));

const blankIndexes = (state: GameState) =>
  state.consonantGrid.flatMap((cell, i) => (cell === '' ? [i] : []));

test('the daily puzzle is a pure function of the local date', () => {
  const a = getPuzzleForDate(TODAY);
  const b = getPuzzleForDate(TODAY);
  assert.equal(a.datasetIndex, b.datasetIndex);
  assert.notEqual(a.datasetIndex, getPuzzleForDate('2026-08-10').datasetIndex);
  assert.equal(a.puzzleId, TODAY);
  assert.equal(a.puzzleNumber, daysSinceLaunch(TODAY) + 1);
});

test('puzzle #1 lands on launch day and numbering advances daily', () => {
  for (const size of SIZES) {
    assert.equal(getPuzzleForDate(LAUNCH_DATE, size).puzzleNumber, 1);
    assert.equal(getPuzzleForDate('2026-01-02', size).puzzleNumber, 2);
  }
});

test('each size runs its own sequence, not a shared one', () => {
  const indexes = SIZES.map((size) => puzzleIndexForDate(TODAY, size));
  assert.equal(new Set(indexes).size > 1, true, 'the sizes should not move in lockstep');
});

test('every puzzle is played once before any repeats', () => {
  for (const size of SIZES) {
    const total = puzzleCount(size);
    const seen = new Set<number>();
    const start = new Date(2026, 0, 1);
    for (let day = 0; day < total; day++) {
      const date = new Date(start);
      date.setDate(start.getDate() + day);
      seen.add(puzzleIndexForDate(toDateKey(date), size));
    }
    assert.equal(seen.size, total, `${size}x${size} should exhaust its dataset`);
  }
});

test('every size ships enough puzzles for a year of dailies', () => {
  for (const size of SIZES) {
    assert.ok(puzzleCount(size) >= 365, `${size}x${size} has only ${puzzleCount(size)} puzzles`);
  }
});

test('the bank holds exactly one vowel per blank, at every size', () => {
  for (const size of SIZES) {
    const puzzle = getPuzzleForDate(TODAY, size);
    assert.equal(puzzle.size, size);
    assert.equal(puzzle.consonantGrid.length, cellCount(size));
    const blanks = puzzle.consonantGrid.filter((cell) => cell === '').length;
    assert.ok(blanks > 0);
    assert.equal(totalVowels(puzzle.initialVowels), blanks);
  }
});

test('placing and removing a vowel moves inventory both ways', () => {
  const fresh = todaysGame();
  const letter = (Object.keys(fresh.currentVowels) as Array<keyof typeof fresh.currentVowels>).find(
    (v) => fresh.currentVowels[v] > 0
  )!;
  const target = blankIndexes(fresh)[0];

  const placed = placeVowel(fresh, target, letter);
  assert.equal(placed.playerGrid[target], letter);
  assert.equal(placed.currentVowels[letter], fresh.currentVowels[letter] - 1);

  const cleared = removeVowel(placed, target);
  assert.equal(cleared.playerGrid[target], '');
  assert.deepEqual(cleared.currentVowels, fresh.currentVowels);
});

test('a vowel with no tokens left cannot be placed', () => {
  let state = todaysGame();
  const stock = state.initialVowels.A;
  const blanks = blankIndexes(state);
  for (let i = 0; i < stock; i++) state = placeVowel(state, blanks[i], 'A');

  assert.equal(state.currentVowels.A, 0);
  const overdrawn = placeVowel(state, blanks[stock], 'A');
  assert.equal(overdrawn.playerGrid[blanks[stock]], '');
  assert.equal(overdrawn, state, 'state should be untouched when the bank is empty');
});

test('locked consonant cells reject placement', () => {
  const state = todaysGame();
  const locked = state.consonantGrid.findIndex((cell) => cell !== '');
  assert.equal(placeVowel(state, locked, 'A'), state);
});

test('replacing a placed vowel returns the old token to the bank', () => {
  const fresh = todaysGame();
  const target = blankIndexes(fresh)[0];
  const withA = placeVowel(fresh, target, 'A');
  const withE = placeVowel(withA, target, 'E');

  assert.equal(withE.playerGrid[target], 'E');
  assert.equal(withE.currentVowels.A, fresh.currentVowels.A);
  assert.equal(withE.currentVowels.E, fresh.currentVowels.E - 1);
});

test('moving a placed vowel keeps the bank untouched', () => {
  const fresh = todaysGame();
  const [from, to] = blankIndexes(fresh);
  const placed = placeVowel(fresh, from, 'A');
  const moved = moveVowel(placed, from, to);

  assert.equal(moved.playerGrid[from], '');
  assert.equal(moved.playerGrid[to], 'A');
  assert.deepEqual(moved.currentVowels, placed.currentVowels);
});

test('clearing the board restores the full bank', () => {
  const fresh = todaysGame();
  const cleared = resetBoard(placeVowel(fresh, blankIndexes(fresh)[0], 'A'));
  assert.deepEqual(cleared.playerGrid, fresh.playerGrid);
  assert.deepEqual(cleared.currentVowels, fresh.initialVowels);
  assert.equal(cleared.placements, 0);
});

test('lines are neutral until full, then judged against the dictionary', () => {
  for (const size of SIZES) {
    const empty = evaluateBoard(todaysGame(size));
    assert.equal(empty.rows.length, size);
    assert.equal(empty.columns.length, size);
    assert.ok(empty.rows.every((line) => line.status !== 'valid' && line.status !== 'invalid'));
    assert.equal(empty.isWon, false);
    assert.equal(empty.isComplete, false);
  }
});

test('a word is only a word at its own length', () => {
  assert.equal(isWord('lava'), true);
  assert.equal(isWord('lav'), false);
});

/** Every prefix of every word of a given length, for pruning the solver below. */
const wordsBySize: Record<PuzzleSize, string[]> = {
  4: size4.words,
  5: size5.words,
  6: size6.words,
  7: size7.words,
};

function prefixesFor(size: PuzzleSize): Set<string> {
  const prefixes = new Set<string>();
  for (const word of wordsBySize[size]) {
    for (let n = 1; n <= size; n++) prefixes.add(word.slice(0, n));
  }
  return prefixes;
}

/**
 * Brute-force a grid through the real game API, to prove the shipped data is
 * playable rather than merely well-formed.
 *
 * Blanks are taken in index order, which is row-major, so when one is filled
 * every cell to its left in the row and above it in the column is already known.
 * Both partial lines are therefore gap-free prefixes and can be rejected on the
 * spot - without that, a 7x7 with twenty blanks never finishes.
 */
function solve(state: GameState): GameState {
  const { size } = state;
  const prefixes = prefixesFor(size);
  const blanks = blankIndexes(state);

  const attempt = (current: GameState, n: number): GameState | null => {
    if (n === blanks.length) return evaluateBoard(current).isWon ? current : null;
    const index = blanks[n];
    const row = Math.floor(index / size);
    const column = index % size;

    for (const letter of ['A', 'E', 'I', 'O', 'U'] as const) {
      if (current.currentVowels[letter] <= 0) continue;
      const next = placeVowel(current, index, letter);
      if (next === current) continue;

      const grid = mergedGrid(next);
      const across = grid.slice(row * size, index + 1).join('');
      const down = Array.from({ length: row + 1 }, (_, r) => grid[r * size + column]).join('');
      if (!prefixes.has(across.toLowerCase()) || !prefixes.has(down.toLowerCase())) continue;

      const solved = attempt(next, n + 1);
      if (solved) return solved;
    }
    return null;
  };

  return attempt(state, 0) ?? state;
}

for (const size of SIZES) {
  test(`a correct ${size}x${size} grid wins, empties the bank, and builds a share card`, () => {
    const fresh = todaysGame(size);
    const solved = solve(fresh);
    const result = evaluateBoard(solved);

    assert.ok(solved.isWon, `today’s ${size}x${size} puzzle should be solvable`);
    assert.ok(result.isComplete);
    assert.equal(totalVowels(solved.currentVowels), 0);
    assert.ok(result.rows.every((line) => isWord(line.word)));
    assert.ok(result.columns.every((line) => isWord(line.word)));
    assert.equal(result.rows.length + result.columns.length, lineCount(size));
    assert.deepEqual(recountVowels(solved), solved.currentVowels);

    const share = buildShareText(solved);
    assert.match(share, new RegExp(`^Vowel Movement ${size}×${size} #\\d+$`, 'm'));
    assert.equal((share.match(/🟩/gu) ?? []).length, cellCount(size));
    assert.match(share, /Placements: \d+/);
  });
}
