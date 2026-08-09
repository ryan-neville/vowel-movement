# Vowel Movement

A daily 4×4 word square. The grid arrives with 8 consonants fixed in place and 8 blanks. You get a
bank of exactly 8 vowel tokens — drag them into the blanks so that all four rows *and* all four
columns spell 4-letter words.

Everyone in the world gets the same grid on the same calendar day. There is no timer, no guess
limit and no way to lose; the only score is how many placements it took you.

```
+---+---+---+---+
| L | A | V | A |   LAVA
| E | X | A | M |   EXAM       down: LEAS  AXLE  VASE  AMOK
| A | L | S | O |   ALSO
| S | E | E | K |   SEEK
+---+---+---+---+
```

The original specification this was built from lives in [docs/requirements.md](docs/requirements.md).

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script                     | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run dev`              | Development server                                                |
| `npm run build`            | Static export to `out/` — plain HTML/CSS/JS, no server needed     |
| `npm test`                 | Game-logic tests (Node's built-in runner, no build step)          |
| `npm run typecheck`        | `tsc --noEmit`                                                    |
| `npm run generate:puzzles` | Rebuilds `data/puzzles.json` and `data/words4.json` from scratch  |
| `npm run verify:puzzles`   | Re-solves every shipped puzzle against the shipped dictionary     |

## How it works

**No backend, anywhere.** The puzzle of the day is a pure function of the visitor's local calendar
date, so every device derives the same grid independently.

- `lib/date.ts` turns `new Date()` into a local `YYYY-MM-DD` key (never UTC, so the grid changes at
  *your* midnight) and counts days since launch for the puzzle number.
- `lib/random.ts` hashes that key with FNV-1a and seeds a mulberry32 PRNG.
- `lib/puzzle.ts` picks the day's grid. Rather than `seed % length` — which would replay puzzles at
  random within weeks — each pass through the dataset is its own seeded shuffle, so all 529 puzzles
  are played before any repeats.
- `lib/game.ts` holds the rules as pure functions over a `GameState`: place, remove, move, and an
  8-line evaluation that runs on every drop.
- `lib/storage.ts` writes the board to `localStorage` on every mutation and rebuilds the bank from
  the board on restore, so the two can never drift apart.

Because the grid depends on the visitor's clock, the board renders only after mount — the
pre-rendered HTML cannot know what day it is where you are.

### The puzzle data

`data/puzzles.json` holds 529 double word squares: 4×4 grids where every row and every column is a
dictionary word, and where each row and each column contains exactly 2 vowels. Blanking the vowels
leaves the 8-consonant skeleton and turns the removed vowels into the day's bank.

`scripts/generate-puzzles.mjs` finds them by depth-first search over ~900 common 4-letter words,
pruning any partial fill whose column prefixes have stopped being prefixes of real words. Squares
are then de-duplicated against their own transposes, filtered to those with 8 distinct words, and
selected with a cap on how often any single word may reappear across the year.

Solutions are deliberately not shipped — the app only ever needs to ask "are all 8 lines words?",
and the answer key would be one devtools tab away.

`scripts/verify-puzzles.mjs` independently re-solves all 529 puzzles against the shipped 5,466-word
dictionary. It is the check that matters: it tests the data the app actually loads, not the data the
generator thinks it wrote.

### Input

Every interaction — drag *and* tap — goes through one Pointer Events handler in
`hooks/useVowelDrag.ts`, which covers mouse, pen and touch with the same code. Pointer capture keeps
the whole gesture on the element it started from, and a press that never travels more than 6px is
reported as a tap instead of a drag.

Cells carry no `click` handler at all. Chrome emits a click after a pointer sequence even when
`pointerdown` was cancelled, and that stray click used to re-apply the move it had just finished:
dropping a token and then immediately spending a second one, or returning a vowel to the bank and
placing it straight back.

- **Drag** a token from the bank to a blank, or drag a placed vowel to another blank.
- **Tap** a token to arm it, then tap blanks to spend it. Tap a placed vowel to return it.
- **Keyboard**: focus a blank and press <kbd>A</kbd>/<kbd>E</kbd>/<kbd>I</kbd>/<kbd>O</kbd>/<kbd>U</kbd>
  to place, <kbd>Backspace</kbd> to clear, <kbd>Enter</kbd> to spend the armed token.

## Deploying

`npm run build` emits a self-contained `out/` directory — upload it anywhere that serves files.

To serve from a subpath (GitHub Pages at `/<repo>/`, for instance), build with:

```bash
NEXT_PUBLIC_BASE_PATH=/vowel-movement npm run build
```

## Layout

```
app/          Next.js App Router shell (layout, page, global tokens, icon)
components/   Board, VowelBank, DragGhost, Game — with co-located CSS modules
hooks/        useVowelMovement (game + persistence), useVowelDrag (pointer input)
lib/          date, random, puzzle, dictionary, game rules, storage, share
data/         Generated: puzzles.json, words4.json
scripts/      Puzzle generator, verifier, and the alias hook that lets Node run the TS tests
tests/        Game-logic tests
```

Dictionary and word-frequency data come from [`word-list`](https://www.npmjs.com/package/word-list)
and [`wordlist-english`](https://www.npmjs.com/package/wordlist-english), used at generation time
only — neither ships in the bundle.
