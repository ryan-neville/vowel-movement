/**
 * Offline puzzle builder. Run with `npm run generate:puzzles`.
 *
 * Emits two static datasets that the app ships with:
 *   data/words4.json   - every accepted 4-letter word (validation dictionary)
 *   data/puzzles.json  - pre-validated 4x4 double word squares, stored as the
 *                        consonant skeleton plus the vowel bank that was removed
 *
 * A puzzle is a 4x4 grid where all 4 rows and all 4 columns are dictionary
 * words, every row holds exactly 2 vowels and every column holds exactly 2
 * vowels. Blanking the vowels therefore leaves 8 consonants and 8 blanks, and
 * the 8 removed vowels become the day's bank.
 *
 * Solutions are deliberately NOT emitted: the app never needs them (a win is
 * "all 8 lines are dictionary words"), and shipping them would hand players the
 * answer key.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');

/** Frequency buckets from `wordlist-english`; lower number = more common. */
const POOL_BUCKETS = [10, 20, 35, 40, 50];
/** Ship at most this many puzzles (one per day, cycling). */
const MAX_PUZZLES = 2000;
/** No single word may appear in more than this many shipped puzzles. */
const MAX_WORD_REUSE = 25;

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const vowelCount = (word) => [...word].filter((c) => VOWELS.has(c)).length;

/** Slurs and crudities we would rather not print on a family word grid. */
const BLOCKLIST = new Set([
  'anal', 'anus', 'arse', 'clit', 'coon', 'cock', 'crap', 'cunt', 'dago', 'dick',
  'dyke', 'fuck', 'gook', 'jism', 'jizz', 'kike', 'kkk', 'mick', 'paki', 'piss',
  'shag', 'shit', 'slut', 'spic', 'suck', 'turd', 'twat', 'wank', 'wog', 'wop',
]);

function readJsonWords(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : Object.keys(parsed);
}

function loadDictionary() {
  const mod = require('word-list');
  const listPath = typeof mod === 'string' ? mod : mod.default;
  return new Set(
    fs
      .readFileSync(listPath, 'utf8')
      .split('\n')
      .map((w) => w.trim())
      .filter((w) => /^[a-z]{4}$/.test(w) && !BLOCKLIST.has(w))
  );
}

function loadPool(dictionary) {
  const bucketDir = path.dirname(require.resolve('wordlist-english/package.json'));
  const pool = new Set();
  for (const bucket of POOL_BUCKETS) {
    for (const word of readJsonWords(path.join(bucketDir, `english-words-${bucket}.json`))) {
      if (/^[a-z]{4}$/.test(word) && dictionary.has(word) && vowelCount(word) === 2) {
        pool.add(word);
      }
    }
  }
  return [...pool].sort();
}

/**
 * Depth-first fill, one row at a time. After each row every column holds a
 * partial string, which must still be a prefix of some candidate word, so dead
 * branches die at depth 1 or 2 instead of at depth 4.
 */
function findSquares(words) {
  const prefixes = [new Set(), new Set(), new Set()];
  for (const word of words) {
    prefixes[0].add(word.slice(0, 1));
    prefixes[1].add(word.slice(0, 2));
    prefixes[2].add(word.slice(0, 3));
  }
  const complete = new Set(words);

  const squares = [];
  const rows = [];
  const walk = (depth) => {
    if (depth === 4) {
      squares.push([...rows]);
      return;
    }
    for (const word of words) {
      let fits = true;
      for (let col = 0; col < 4 && fits; col++) {
        let down = '';
        for (let r = 0; r < depth; r++) down += rows[r][col];
        down += word[col];
        fits = depth === 3 ? complete.has(down) : prefixes[depth].has(down);
      }
      if (!fits) continue;
      rows.push(word);
      walk(depth + 1);
      rows.pop();
    }
  };
  walk(0);
  return squares;
}

const columnsOf = (rows) =>
  [0, 1, 2, 3].map((col) => rows.map((row) => row[col]).join(''));

/**
 * Rows and columns are interchangeable views of the same square, so a square
 * and its transpose are the same puzzle. Key on whichever reads smaller.
 */
function canonicalKey(rows) {
  const across = rows.join('');
  const down = columnsOf(rows).join('');
  return across < down ? across : down;
}

function toPuzzle(rows) {
  const cells = rows.join('');
  let consonants = '';
  const bank = [];
  for (const letter of cells) {
    if (VOWELS.has(letter)) {
      consonants += '.';
      bank.push(letter.toUpperCase());
    } else {
      consonants += letter.toUpperCase();
    }
  }
  return { c: consonants, v: bank.sort().join('') };
}

/** Deterministic shuffle so re-running the script reproduces the same dataset. */
function seededShuffle(items, seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function main() {
  const dictionary = loadDictionary();
  const pool = loadPool(dictionary);
  console.log(`dictionary: ${dictionary.size} words · generation pool: ${pool.length} words`);

  console.time('search');
  const squares = findSquares(pool);
  console.timeEnd('search');
  console.log(`raw double word squares: ${squares.length}`);

  // Keep squares whose 8 lines are all different words, one per transpose pair,
  // and one per distinct on-screen puzzle (same skeleton + same bank).
  const seenSquare = new Set();
  const seenPuzzle = new Set();
  const candidates = [];
  for (const rows of squares) {
    const cols = columnsOf(rows);
    if (new Set([...rows, ...cols]).size !== 8) continue;
    if (cols.some((col) => vowelCount(col) !== 2)) continue;

    const key = canonicalKey(rows);
    if (seenSquare.has(key)) continue;
    seenSquare.add(key);

    const puzzle = toPuzzle(rows);
    const puzzleKey = `${puzzle.c}|${puzzle.v}`;
    if (seenPuzzle.has(puzzleKey)) continue;
    seenPuzzle.add(puzzleKey);

    candidates.push({ puzzle, words: [...rows, ...cols] });
  }
  console.log(`distinct playable puzzles: ${candidates.length}`);

  // Spread the shipped set across the vocabulary instead of letting a handful
  // of prolific words (able, area, ores...) dominate the year.
  const uses = new Map();
  const chosen = [];
  for (const candidate of seededShuffle(candidates, 0x5645454c)) {
    if (chosen.length >= MAX_PUZZLES) break;
    if (candidate.words.some((w) => (uses.get(w) ?? 0) >= MAX_WORD_REUSE)) continue;
    for (const w of candidate.words) uses.set(w, (uses.get(w) ?? 0) + 1);
    chosen.push(candidate.puzzle);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, 'words4.json'),
    `${JSON.stringify([...dictionary].sort())}\n`
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'puzzles.json'),
    `[\n${chosen.map((p) => JSON.stringify(p)).join(',\n')}\n]\n`
  );

  console.log(`shipped ${chosen.length} puzzles across ${uses.size} distinct words`);
  console.log('sample:', chosen[0]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
