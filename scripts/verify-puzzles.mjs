/**
 * Independently re-solves every shipped puzzle against the shipped dictionary.
 *
 * The generator builds puzzles from known-good squares, but this checks the
 * data the app actually loads: for each puzzle, some arrangement of exactly the
 * day's 8 vowel tokens must fill the 8 blanks so all 4 rows and 4 columns are
 * dictionary words. Run with `node scripts/verify-puzzles.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puzzles = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/puzzles.json'), 'utf8'));
const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/words4.json'), 'utf8'));

const dictionary = new Set(words);
const prefixes = new Set();
for (const word of words) {
  for (let n = 1; n <= 4; n++) prefixes.add(word.slice(0, n));
}

const rowOf = (cells, r) => cells.slice(r * 4, r * 4 + 4).join('');
const colOf = (cells, c) => [0, 1, 2, 3].map((r) => cells[r * 4 + c]).join('');

/** A partially filled line is fine while it is still some word's prefix. */
function lineOk(line) {
  const known = line.replace(/\.+$/, '');
  if (known.includes('.')) return true; // gap in the middle: nothing to check yet
  return known.length === 4 ? dictionary.has(known) : prefixes.has(known);
}

function solve(puzzle) {
  const cells = puzzle.c.toLowerCase().split('');
  const blanks = cells.flatMap((ch, i) => (ch === '.' ? [i] : []));
  const bank = new Map();
  for (const v of puzzle.v.toLowerCase()) bank.set(v, (bank.get(v) ?? 0) + 1);

  const place = (n) => {
    if (n === blanks.length) return true;
    const index = blanks[n];
    const row = Math.floor(index / 4);
    const col = index % 4;
    for (const [letter, left] of bank) {
      if (left === 0) continue;
      cells[index] = letter;
      bank.set(letter, left - 1);
      if (lineOk(rowOf(cells, row)) && lineOk(colOf(cells, col)) && place(n + 1)) return true;
      bank.set(letter, left);
      cells[index] = '.';
    }
    return false;
  };

  return place(0) ? cells.join('') : null;
}

let failures = 0;
for (const [index, puzzle] of puzzles.entries()) {
  if (puzzle.c.length !== 16) throw new Error(`puzzle ${index}: grid is not 16 cells`);
  if (puzzle.v.length !== 8) throw new Error(`puzzle ${index}: bank is not 8 vowels`);
  if ((puzzle.c.match(/\./g) ?? []).length !== 8) {
    throw new Error(`puzzle ${index}: expected exactly 8 blanks`);
  }
  if (!solve(puzzle)) {
    failures++;
    console.error(`UNSOLVABLE puzzle ${index}: ${puzzle.c} bank=${puzzle.v}`);
  }
}

console.log(
  failures === 0
    ? `OK - all ${puzzles.length} puzzles solvable against ${dictionary.size} words`
    : `${failures} of ${puzzles.length} puzzles failed`
);
process.exit(failures === 0 ? 0 : 1);
