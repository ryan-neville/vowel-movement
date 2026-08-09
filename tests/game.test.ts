import assert from 'node:assert/strict';
import test from 'node:test';

import { toDateKey, daysSinceLaunch, LAUNCH_DATE } from '@/lib/date';
import { isWord } from '@/lib/dictionary';
import {
  CELL_COUNT,
  createGameState,
  evaluateBoard,
  moveVowel,
  placeVowel,
  recountVowels,
  removeVowel,
  resetBoard,
  totalVowels,
  type GameState,
} from '@/lib/game';
import { PUZZLE_COUNT, getPuzzleForDate, puzzleIndexForDate } from '@/lib/puzzle';
import { buildShareText } from '@/lib/share';

const TODAY = '2026-08-09';

test('the daily puzzle is a pure function of the local date', () => {
  const a = getPuzzleForDate(TODAY);
  const b = getPuzzleForDate(TODAY);
  assert.equal(a.datasetIndex, b.datasetIndex);
  assert.notEqual(a.datasetIndex, getPuzzleForDate('2026-08-10').datasetIndex);
  assert.equal(a.puzzleId, TODAY);
  assert.equal(a.puzzleNumber, daysSinceLaunch(TODAY) + 1);
});

test('puzzle #1 lands on launch day and numbering advances daily', () => {
  assert.equal(getPuzzleForDate(LAUNCH_DATE).puzzleNumber, 1);
  assert.equal(getPuzzleForDate('2026-01-02').puzzleNumber, 2);
});

test('every puzzle is played once before any repeats', () => {
  const seen = new Set<number>();
  const start = new Date(2026, 0, 1);
  for (let day = 0; day < PUZZLE_COUNT; day++) {
    const date = new Date(start);
    date.setDate(start.getDate() + day);
    seen.add(puzzleIndexForDate(toDateKey(date)));
  }
  assert.equal(seen.size, PUZZLE_COUNT);
});

test('the day is dealt 8 vowels and 8 blanks', () => {
  const puzzle = getPuzzleForDate(TODAY);
  assert.equal(puzzle.consonantGrid.length, CELL_COUNT);
  assert.equal(puzzle.consonantGrid.filter((cell) => cell === '').length, 8);
  assert.equal(totalVowels(puzzle.initialVowels), 8);
});

const blankIndexes = (state: GameState) =>
  state.consonantGrid.flatMap((cell, i) => (cell === '' ? [i] : []));

function todaysGame(): GameState {
  return createGameState(getPuzzleForDate(TODAY));
}

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
  const state = todaysGame();
  const empty = evaluateBoard(state);
  assert.ok(empty.rows.every((line) => line.status !== 'valid' && line.status !== 'invalid'));
  assert.equal(empty.isWon, false);
  assert.equal(empty.isComplete, false);
});

/** Brute-force today's grid the way the verifier does, to reach a real win. */
function solve(state: GameState): GameState {
  const blanks = blankIndexes(state);
  const attempt = (current: GameState, n: number): GameState | null => {
    if (n === blanks.length) return evaluateBoard(current).isWon ? current : null;
    for (const letter of ['A', 'E', 'I', 'O', 'U'] as const) {
      if (current.currentVowels[letter] <= 0) continue;
      const next = placeVowel(current, blanks[n], letter);
      if (next === current) continue;
      const check = evaluateBoard(next);
      const row = Math.floor(blanks[n] / 4);
      const column = blanks[n] % 4;
      if (check.rows[row].status === 'invalid' || check.columns[column].status === 'invalid') {
        continue;
      }
      const solved = attempt(next, n + 1);
      if (solved) return solved;
    }
    return null;
  };
  return attempt(state, 0) ?? state;
}

test('a correct grid wins, empties the bank, and builds a share card', () => {
  const solved = solve(todaysGame());
  const result = evaluateBoard(solved);

  assert.ok(solved.isWon, 'today’s puzzle should be solvable');
  assert.ok(result.isComplete);
  assert.equal(totalVowels(solved.currentVowels), 0);
  assert.ok(result.rows.every((line) => isWord(line.word)));
  assert.ok(result.columns.every((line) => isWord(line.word)));
  assert.deepEqual(recountVowels(solved), solved.currentVowels);

  const share = buildShareText(solved);
  assert.match(share, /^Vowel Movement #\d+$/m);
  assert.equal((share.match(/🟩/gu) ?? []).length, 16);
  assert.match(share, /Placements: \d+/);
});
