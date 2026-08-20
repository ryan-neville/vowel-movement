/**
 * Independently re-solves every shipped puzzle against the shipped dictionary.
 *
 * The generator builds puzzles from known-good squares, but this checks the data
 * the app actually loads: for each puzzle, some arrangement of exactly that day's
 * vowel tokens must fill the blanks so that all N rows and all N columns are
 * dictionary words.
 *
 * Run with `npm run verify:puzzles`, optionally with sizes to check just those,
 * and `--show` to print one solved grid per size.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = [4, 5, 6, 7];

const args = process.argv.slice(2);
const show = args.includes('--show');
const requested = args.map(Number).filter((n) => SIZES.includes(n));
const sizes = requested.length > 0 ? requested : SIZES;

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

/**
 * Solve one puzzle by walking the grid in row-major order.
 *
 * Filling in that order means that when cell (r, c) is set, every cell to its
 * left in row r and every cell above it in column c is already known - so both
 * partial lines are gap-free prefixes and can be checked against the prefix set
 * on the spot. That is what keeps a 7x7 with 20 blanks from going exponential.
 */
function solve(puzzle, size, dictionary, prefixes) {
  const cells = puzzle.c.toLowerCase().split('');
  const bank = new Map();
  for (const vowel of puzzle.v.toLowerCase()) bank.set(vowel, (bank.get(vowel) ?? 0) + 1);

  const lineOk = (letters, complete) =>
    complete ? dictionary.has(letters) : prefixes.has(letters);

  const fits = (row, column) => {
    let across = '';
    for (let c = 0; c <= column; c++) across += cells[row * size + c];
    if (!lineOk(across, column === size - 1)) return false;

    let down = '';
    for (let r = 0; r <= row; r++) down += cells[r * size + column];
    return lineOk(down, row === size - 1);
  };

  const place = (index) => {
    if (index === size * size) return true;
    const row = Math.floor(index / size);
    const column = index % size;

    if (cells[index] !== '.') return fits(row, column) && place(index + 1);

    for (const [letter, left] of bank) {
      if (left === 0) continue;
      cells[index] = letter;
      bank.set(letter, left - 1);
      if (fits(row, column) && place(index + 1)) return true;
      bank.set(letter, left);
      cells[index] = '.';
    }
    return false;
  };

  return place(0) ? cells.join('') : null;
}

let failures = 0;
let checked = 0;

for (const size of sizes) {
  const puzzles = readJson(`data/puzzles${size}.json`);
  const words = readJson(`data/words${size}.json`);

  const dictionary = new Set(words);
  const prefixes = new Set();
  for (const word of words) {
    for (let n = 1; n <= size; n++) prefixes.add(word.slice(0, n));
  }

  let solved = null;
  const started = Date.now();

  for (const [index, puzzle] of puzzles.entries()) {
    const where = `${size}x${size} puzzle ${index}`;
    if (puzzle.c.length !== size * size) throw new Error(`${where}: grid is not ${size * size} cells`);

    const blanks = (puzzle.c.match(/\./g) ?? []).length;
    if (puzzle.v.length !== blanks) {
      throw new Error(`${where}: ${blanks} blanks but ${puzzle.v.length} vowels in the bank`);
    }
    if (/[^AEIOU]/.test(puzzle.v)) throw new Error(`${where}: bank holds a non-vowel`);
    if (/[^A-Z.]/.test(puzzle.c)) throw new Error(`${where}: grid holds an unexpected character`);

    const answer = solve(puzzle, size, dictionary, prefixes);
    checked++;
    if (answer) {
      solved ??= answer;
    } else {
      failures++;
      console.error(`UNSOLVABLE ${where}: ${puzzle.c} bank=${puzzle.v}`);
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${size}x${size}: ${puzzles.length} puzzles against ${dictionary.size} words in ${seconds}s`
  );

  if (show && solved) {
    for (let r = 0; r < size; r++) {
      console.log(`   ${solved.slice(r * size, r * size + size).toUpperCase().split('').join(' ')}`);
    }
  }
}

console.log(
  failures === 0
    ? `OK - all ${checked} puzzles solvable`
    : `${failures} of ${checked} puzzles failed`
);
process.exit(failures === 0 ? 0 : 1);
