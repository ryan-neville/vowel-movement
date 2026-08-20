/**
 * Offline puzzle builder. Run with `npm run generate:puzzles`, optionally with a
 * list of sizes to rebuild just those: `npm run generate:puzzles -- 6 7`.
 *
 * Emits two static datasets per board size N (4, 5, 6, 7):
 *   data/words<N>.json    - every accepted N-letter word (validation dictionary)
 *   data/puzzles<N>.json  - pre-validated NxN double word squares, stored as the
 *                           consonant skeleton plus the vowel bank that was removed
 *
 * A puzzle is an NxN grid where all N rows and all N columns are dictionary
 * words, and where every row and every column holds a permitted number of
 * vowels. Blanking the vowels leaves the consonant skeleton, and the removed
 * vowels become the day's bank.
 *
 * Solutions are deliberately NOT emitted: the app never needs them (a win is
 * "all 2N lines are dictionary words"), and shipping them would hand players the
 * answer key.
 *
 * ## Why the search looks like this
 *
 * Double word squares get dramatically rarer as N grows. Order 4 and 5 are
 * everywhere; order 6 needs real pruning; order 7 is scarce enough that a naive
 * word-by-word search never finishes. So the grid is filled a *letter* at a time
 * in row-major order, against a trie of the word pool: at each cell the legal
 * letters are the intersection of what the row prefix allows and what the column
 * prefix allows, which is a single `&` of two 26-bit masks. Dead branches die
 * two or three letters in instead of after a whole word is committed.
 *
 * Even so, the overwhelming majority of first rows extend to nothing at all, and
 * the ones that do give up a square quickly. Grinding a hopeless first row is
 * pure waste, so each first row gets a fixed node budget and is then abandoned -
 * failing fast finds several times more squares per second than searching any
 * one branch exhaustively. A pass is one sweep over every candidate first row,
 * with its own shuffled letter ordering; passes are independent, deterministic
 * from their index alone, and therefore handed out across worker threads.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');

/**
 * Per-size search settings.
 *
 * `buckets` are frequency tiers from `wordlist-english` (lower = more common);
 * the pool is their union, and a word's tier also scores the squares it appears
 * in, so the shipped set prefers everyday vocabulary. Sizes 4-6 stay inside the
 * common tiers; 7 has to reach further down the frequency list because that is
 * the only way order-7 double word squares exist in any quantity at all.
 *
 * `seedNodes` is the per-first-row search budget and `passes` the number of
 * sweeps - together they set both the yield and the runtime.
 */
export const CONFIGS = {
  4: {
    buckets: [10, 20, 35, 40, 50],
    vowelsPerLine: [2, 2],
    passes: 4,
    seedNodes: 400_000,
    perSeed: 4,
    maxPuzzles: 1000,
    maxWordReuse: 30,
  },
  5: {
    buckets: [10, 20, 35, 40, 50],
    vowelsPerLine: [2, 3],
    passes: 8,
    seedNodes: 400_000,
    perSeed: 3,
    maxPuzzles: 1000,
    maxWordReuse: 30,
  },
  6: {
    buckets: [10, 20, 35, 40, 50, 55, 60, 70],
    fullPool: true,
    vowelsPerLine: [2, 3],
    passes: 6,
    seedNodes: 200_000,
    perSeed: 2,
    maxPuzzles: 800,
    maxWordReuse: 40,
  },
  // 7x7 is the one size that cannot be a double word square - see SYMMETRY below.
  7: {
    buckets: [10, 20, 35, 40, 50, 55, 60, 70],
    fullPool: true,
    vowelsPerLine: [2, 3],
    distinctWords: false,
    passes: 12,
    seedNodes: 500_000,
    perSeed: 2,
    maxPuzzles: 500,
    maxWordReuse: 60,
  },
};

/**
 * ## SYMMETRY: why 7x7 is a different animal
 *
 * Sizes 4, 5 and 6 ship *double* word squares - 2N different words, the N across
 * having nothing to do with the N down. At order 7 those effectively stop
 * existing at this vocabulary size. Sweeping 4,000 first rows with a half-million
 * node budget each turns up 21 squares and every single one of them is
 * symmetric: the grid equals its own transpose, so column i spells the same word
 * as row i and there are 7 distinct words rather than 14. Widening the search to
 * 800 first rows at a 5-million node budget, with repeats forbidden outright,
 * finds none at all. That is the known shape of the problem - order-7 double word
 * squares need a lexicon far larger than the 33,000 seven-letter words here.
 *
 * So 7x7 ships the classic symmetric word square instead. The game's rule is
 * untouched - every row and every column is a dictionary word - and the mirror
 * is what makes a 49-cell grid humane: solving the top-right half solves the
 * bottom-left with it. `distinctWords: false` turns off the repeat pruning that
 * would reject exactly these, and `minDistinctWords` below drops the bar to N.
 */
const minDistinctWords = (size) => (CONFIGS[size].distinctWords === false ? size : size * 2);

export const SIZES = [4, 5, 6, 7];

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const vowelCount = (word) => [...word].filter((c) => VOWELS.has(c)).length;

const A_CODE = 'a'.charCodeAt(0);
const VOWEL_MASK = [...VOWELS].reduce((mask, c) => mask | (1 << (c.charCodeAt(0) - A_CODE)), 0);

/**
 * Words we would rather not print on a family word grid.
 *
 * The list of them lives in the `obscenity` package, not in this repository -
 * a word game has no business carrying a file of slurs around, and a maintained
 * dataset is better than one hand-typed here. `word-list` is already largely
 * clean, so this only has to catch the few that get through.
 *
 * Matching is deliberately whole-word. Obscenity scans for substrings, which is
 * exactly right for free text - it is how "fuuuck" and "f.u.c.k" get caught -
 * but wrong for a dictionary, where it throws out cockpit, annals, assort,
 * rapped and chinked for containing somebody else's letters. A grid entry is
 * only a problem when the entry *is* the word, so a match has to span all of it.
 */
const obscenity = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

const isObscene = (word) =>
  obscenity
    .getAllMatches(word)
    .some((match) => match.startIndex === 0 && match.endIndex >= word.length - 1);

function readJsonWords(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Array.isArray(parsed) ? parsed : Object.keys(parsed);
}

/** Every word of the given length the app will accept, obscenities removed. */
function loadDictionary(size) {
  const mod = require('word-list');
  const listPath = typeof mod === 'string' ? mod : mod.default;
  const shape = new RegExp(`^[a-z]{${size}}$`);
  return new Set(
    fs
      .readFileSync(listPath, 'utf8')
      .split('\n')
      .map((word) => word.trim())
      .filter((word) => shape.test(word) && !isObscene(word))
  );
}

/**
 * The generation pool, plus a way to look up a word's frequency tier. Tier 0 is
 * the most common bucket; squares are later ranked by the mean tier of their
 * words, so that given the choice the shipped set uses vocabulary players know.
 */
function loadPool(size, dictionary, config) {
  const [minVowels, maxVowels] = config.vowelsPerLine;
  const bucketDir = path.dirname(require.resolve('wordlist-english/package.json'));
  const shape = new RegExp(`^[a-z]{${size}}$`);
  const tier = new Map();

  for (const [index, bucket] of config.buckets.entries()) {
    for (const word of readJsonWords(path.join(bucketDir, `english-words-${bucket}.json`))) {
      if (shape.test(word) && dictionary.has(word) && !tier.has(word)) tier.set(word, index);
    }
  }

  // Anything the frequency list has never heard of scores as one tier worse than
  // the rarest bucket, so a square built from obscure words sorts to the back.
  const unranked = config.buckets.length;
  const candidates = config.fullPool ? dictionary : tier.keys();

  // Every line of a finished square - row and column alike - sits inside the
  // vowel bounds, so a word that cannot is dead weight in the trie: it widens
  // the letter masks and buys branches the search only prunes later.
  const words = [...candidates]
    .filter((word) => {
      const vowels = vowelCount(word);
      return vowels >= minVowels && vowels <= maxVowels;
    })
    .sort();

  return { words, tierOf: (word) => tier.get(word) ?? unranked };
}

/** Flat trie: `children[node * 26 + letter]` is a node id (0 = absent). */
function buildTrie(words) {
  let capacity = 1024;
  let children = new Int32Array(capacity * 26);
  let masks = new Int32Array(capacity);
  let count = 1;

  const grow = () => {
    capacity *= 2;
    const nextChildren = new Int32Array(capacity * 26);
    nextChildren.set(children);
    children = nextChildren;
    const nextMasks = new Int32Array(capacity);
    nextMasks.set(masks);
    masks = nextMasks;
  };

  for (const word of words) {
    let node = 0;
    for (let i = 0; i < word.length; i++) {
      const letter = word.charCodeAt(i) - A_CODE;
      masks[node] |= 1 << letter;
      let next = children[node * 26 + letter];
      if (next === 0) {
        if (count === capacity) grow();
        next = count++;
        children[node * 26 + letter] = next;
      }
      node = next;
    }
  }

  return { children, masks, nodeCount: count };
}

/** mulberry32 - the same generator the app uses, so "deterministic" means it. */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(items, seed) {
  const next = typeof seed === 'function' ? seed : makeRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * One sweep over every candidate first row, filling the rest of the grid a
 * letter at a time. Deterministic in `pass` alone, which is what lets passes be
 * distributed across threads and still reassemble into a reproducible dataset.
 */
export function runPass(context, pass) {
  const { size, trie, seeds, minVowels, maxVowels, seedNodes, perSeed, distinctWords } = context;
  const { children, masks, nodeCount } = trie;
  const cells = size * size;

  const rng = makeRng(Math.imul(pass + 1, 0x9e3779b1) ^ Math.imul(size, 0x85ebca6b));
  // Two orderings, one for each side of the main diagonal. A single ordering
  // makes the search mirror itself: the letter it picks at (r, c) is usually the
  // one it picks at (c, r), so it walks straight into symmetric squares, where
  // every column repeats a row and there are only N distinct words instead of 2N.
  const upperOrder = seededShuffle([...Array(26).keys()], rng);
  const lowerOrder = seededShuffle([...Array(26).keys()], rng);
  const seedOrder = seededShuffle(seeds, rng);

  const grid = new Uint8Array(cells);
  const rowNode = new Int32Array(size);
  const columnNode = new Int32Array(size);
  const rowVowels = new Int32Array(size);
  const columnVowels = new Int32Array(size);
  // Words already spoken for, by their terminal trie node - every pool word is
  // exactly `size` letters, so a depth-`size` node names one word and only one.
  const claimed = new Uint8Array(nodeCount);

  const found = [];
  let budget = 0;
  let target = 0;

  /** Fill cell `position`; returns true to unwind (enough found, or out of budget). */
  const walk = (position) => {
    if (found.length >= target) return true;
    if (++budget > seedNodes) return true;

    if (position === cells) {
      const rows = [];
      for (let r = 0; r < size; r++) {
        let word = '';
        for (let c = 0; c < size; c++) word += String.fromCharCode(A_CODE + grid[r * size + c]);
        rows.push(word);
      }
      found.push(rows);
      return found.length >= target;
    }

    const row = (position / size) | 0;
    const column = position % size;
    const fromRow = rowNode[row];
    const fromColumn = columnNode[column];
    let allowed = masks[fromRow] & masks[fromColumn];

    // Vowel budget: forbid vowels once a line is full, and force one once the
    // cells left in a line are exactly the vowels it still owes.
    if (rowVowels[row] >= maxVowels || columnVowels[column] >= maxVowels) allowed &= ~VOWEL_MASK;
    if (
      rowVowels[row] + (size - column - 1) < minVowels ||
      columnVowels[column] + (size - row - 1) < minVowels
    ) {
      allowed &= VOWEL_MASK;
    }
    if (allowed === 0) return false;

    const rowEnds = column === size - 1;
    const columnEnds = row === size - 1;

    for (const letter of column > row ? upperOrder : lowerOrder) {
      if ((allowed & (1 << letter)) === 0) continue;
      const isVowel = (VOWEL_MASK & (1 << letter)) !== 0;

      const toRow = children[fromRow * 26 + letter];
      const toColumn = children[fromColumn * 26 + letter];
      grid[position] = letter;
      rowNode[row] = toRow;
      columnNode[column] = toColumn;
      if (isVowel) {
        rowVowels[row]++;
        columnVowels[column]++;
      }

      // A line that has just been completed must have paid its vowel minimum and
      // must not repeat a word already on the board. Claiming words here rather
      // than filtering finished squares later is what keeps the search on
      // genuine double word squares instead of symmetric ones.
      let ok =
        (!rowEnds || rowVowels[row] >= minVowels) &&
        (!columnEnds || columnVowels[column] >= minVowels);
      let claimedRow = false;
      let claimedColumn = false;

      if (ok && distinctWords && rowEnds) {
        if (claimed[toRow]) {
          ok = false;
        } else {
          claimed[toRow] = 1;
          claimedRow = true;
        }
      }
      if (ok && distinctWords && columnEnds) {
        if (claimed[toColumn]) {
          ok = false;
        } else {
          claimed[toColumn] = 1;
          claimedColumn = true;
        }
      }

      const done = ok ? walk(position + 1) : false;

      if (claimedRow) claimed[toRow] = 0;
      if (claimedColumn) claimed[toColumn] = 0;
      if (isVowel) {
        rowVowels[row]--;
        columnVowels[column]--;
      }
      rowNode[row] = fromRow;
      columnNode[column] = fromColumn;
      if (done) return true;
    }

    return false;
  };

  for (const first of seedOrder) {
    rowNode.fill(0);
    columnNode.fill(0);
    rowVowels.fill(0);
    columnVowels.fill(0);

    for (let c = 0; c < size; c++) {
      const letter = first.charCodeAt(c) - A_CODE;
      grid[c] = letter;
      columnNode[c] = children[letter];
      if (VOWEL_MASK & (1 << letter)) columnVowels[c]++;
      rowNode[0] = children[rowNode[0] * 26 + letter];
    }
    rowVowels[0] = vowelCount(first);

    budget = 0;
    target = found.length + perSeed;
    if (distinctWords) claimed[rowNode[0]] = 1;
    walk(size);
    if (distinctWords) claimed[rowNode[0]] = 0;
  }

  return found;
}

export function buildContext(size) {
  const config = CONFIGS[size];
  const dictionary = loadDictionary(size);
  const [minVowels, maxVowels] = config.vowelsPerLine;
  const { words, tierOf } = loadPool(size, dictionary, config);
  const trie = buildTrie(words);

  /**
   * A first row is only usable if every letter in it starts some pool word -
   * that letter opens a column, and a column that no word can begin cannot be
   * completed. The check has to happen here because `children[...] === 0` means
   * "no such child" and 0 is also the root, so seeding a column from a missing
   * child would silently restart it from depth zero and validate a short word.
   */
  const opensAColumn = (word) =>
    [...word].every((letter) => trie.masks[0] & (1 << (letter.charCodeAt(0) - A_CODE)));

  return {
    size,
    config,
    dictionary,
    pool: words,
    tierOf,
    minVowels,
    maxVowels,
    distinctWords: config.distinctWords !== false,
    seedNodes: config.seedNodes,
    perSeed: config.perSeed,
    trie,
    seeds: words.filter(opensAColumn),
  };
}

// ---------------------------------------------------------------------------
// Worker half: run an assigned list of passes and ship the squares back.
// ---------------------------------------------------------------------------

if (!isMainThread && workerData?.kind === 'passes') {
  const context = buildContext(workerData.size);
  const results = workerData.passes.map((pass) => ({ pass, squares: runPass(context, pass) }));
  parentPort.postMessage(results);
}

/**
 * Deal the passes round-robin across threads and reassemble them in pass order,
 * so the dataset does not depend on which worker finished first.
 */
async function searchInParallel(size, onProgress) {
  const { passes } = CONFIGS[size];
  const threads = Math.max(1, Math.min(passes, os.cpus().length - 1));
  const buckets = Array.from({ length: threads }, () => []);
  for (let pass = 0; pass < passes; pass++) buckets[pass % threads].push(pass);

  const byPass = new Map();
  let done = 0;

  await Promise.all(
    buckets.map(
      (assigned) =>
        new Promise((resolve, reject) => {
          const worker = new Worker(fileURLToPath(import.meta.url), {
            workerData: { kind: 'passes', size, passes: assigned },
          });
          worker.on('message', (results) => {
            for (const { pass, squares } of results) {
              byPass.set(pass, squares);
              done++;
            }
            onProgress?.(done, passes);
          });
          worker.on('error', reject);
          worker.on('exit', (code) =>
            code === 0 ? resolve() : reject(new Error(`worker exited with ${code}`))
          );
        })
    )
  );

  return Array.from({ length: passes }, (_, pass) => byPass.get(pass) ?? []).flat();
}

// ---------------------------------------------------------------------------
// Main half: search, filter, rank, ship.
// ---------------------------------------------------------------------------

const columnsOf = (rows) =>
  rows[0].split('').map((_, column) => rows.map((row) => row[column]).join(''));

/**
 * Rows and columns are interchangeable views of the same square, so a square and
 * its transpose are the same puzzle. Key on whichever reads smaller.
 */
function canonicalKey(rows) {
  const across = rows.join('');
  const down = columnsOf(rows).join('');
  return across < down ? across : down;
}

function toPuzzle(rows) {
  let consonants = '';
  const bank = [];
  for (const letter of rows.join('')) {
    if (VOWELS.has(letter)) {
      consonants += '.';
      bank.push(letter.toUpperCase());
    } else {
      consonants += letter.toUpperCase();
    }
  }
  return { c: consonants, v: bank.sort().join('') };
}

async function generate(size) {
  const context = buildContext(size);
  const { config, dictionary, pool, tierOf } = context;

  console.log(
    `\n=== ${size}x${size} === dictionary ${dictionary.size} · pool ${pool.length} · ` +
      `${config.vowelsPerLine[0]}-${config.vowelsPerLine[1]} vowels per line · ${config.passes} passes`
  );

  console.time(`${size}x${size} search`);
  const squares = await searchInParallel(size, (done, total) => {
    if (done % Math.max(1, Math.round(total / 10)) === 0) {
      process.stdout.write(`  ${done}/${total} passes\r`);
    }
  });
  console.timeEnd(`${size}x${size} search`);
  console.log(`raw word squares: ${squares.length}`);

  // Keep the squares that clear the distinct-word bar, one per transpose pair,
  // and one per distinct on-screen puzzle (same skeleton + same bank).
  const seenSquare = new Set();
  const seenPuzzle = new Set();
  const candidates = [];
  const dropped = { repeatedWord: 0, duplicate: 0 };
  const minDistinct = minDistinctWords(size);

  for (const rows of squares) {
    const columns = columnsOf(rows);
    const words = [...rows, ...columns];
    // No line may repeat another on its own axis, whatever the size, and the
    // square as a whole has to clear the distinct-word bar for its size.
    if (
      new Set(rows).size !== size ||
      new Set(columns).size !== size ||
      new Set(words).size < minDistinct
    ) {
      dropped.repeatedWord++;
      continue;
    }

    const key = canonicalKey(rows);
    if (seenSquare.has(key)) {
      dropped.duplicate++;
      continue;
    }
    seenSquare.add(key);

    const puzzle = toPuzzle(rows);
    const puzzleKey = `${puzzle.c}|${puzzle.v}`;
    if (seenPuzzle.has(puzzleKey)) continue;
    seenPuzzle.add(puzzleKey);

    // Lower is commoner: the mean frequency tier over the words on the board.
    // Averaging rather than summing keeps a symmetric square, which names each
    // word twice, on the same scale as a double one.
    const distinct = [...new Set(words)];
    const score = distinct.reduce((sum, word) => sum + tierOf(word), 0) / distinct.length;
    candidates.push({ puzzle, words: distinct, score });
  }
  console.log(
    `distinct playable puzzles: ${candidates.length} ` +
      `(dropped ${dropped.duplicate} repeats, ${dropped.repeatedWord} below ${minDistinct} distinct words)`
  );

  // Prefer the everyday-vocabulary squares, but cap how often any one word may
  // reappear so a handful of prolific words cannot dominate the year. The
  // shuffle-then-stable-sort keeps the choice inside a score tier arbitrary
  // rather than alphabetical.
  const shuffled = seededShuffle(candidates, 0x5645454c ^ size);
  shuffled.sort((a, b) => a.score - b.score);

  const uses = new Map();
  const chosen = [];
  for (const candidate of shuffled) {
    if (chosen.length >= config.maxPuzzles) break;
    if (candidate.words.some((word) => (uses.get(word) ?? 0) >= config.maxWordReuse)) continue;
    for (const word of candidate.words) uses.set(word, (uses.get(word) ?? 0) + 1);
    chosen.push(candidate.puzzle);
  }

  if (chosen.length === 0) throw new Error(`${size}x${size}: search produced no puzzles`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, `words${size}.json`),
    `${JSON.stringify([...dictionary].sort())}\n`
  );
  fs.writeFileSync(
    path.join(DATA_DIR, `puzzles${size}.json`),
    `[\n${chosen.map((puzzle) => JSON.stringify(puzzle)).join(',\n')}\n]\n`
  );

  const blanks = (chosen[0].c.match(/\./g) ?? []).length;
  console.log(
    `shipped ${chosen.length} puzzles across ${uses.size} distinct words ` +
      `(${blanks} blanks in the first)`
  );
  console.log('sample:', chosen[0]);
}

async function main() {
  const requested = process.argv.slice(2).map(Number).filter((n) => SIZES.includes(n));
  const sizes = requested.length > 0 ? requested : SIZES;
  for (const size of sizes) await generate(size);
}

// `process.argv[1]` is undefined under `node --eval`, which is a supported way
// to import this module for its search internals rather than run it.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainThread && invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
