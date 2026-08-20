# Vowel Movement

A daily word square, in four sizes. The grid arrives with its consonants fixed in place and every
vowel blanked out. You get a bank holding exactly one vowel token per blank — drag them into the
gaps so that every row *and* every column spells a word.

Everyone in the world gets the same grid on the same calendar day. There is no timer, no guess limit
and no way to lose; the only score is how many placements it took you. Each size runs its own daily
sequence and keeps its own streak, so switching between them costs you nothing.

```
+---+---+---+---+
| L | A | V | A |   LAVA
| E | X | A | M |   EXAM       down: LEAS  AXLE  VASE  AMOK
| A | L | S | O |   ALSO
| S | E | E | K |   SEEK
+---+---+---+---+
```

The original specification this was built from lives in [docs/requirements.md](docs/requirements.md);
it describes the 4×4 game, which is still the one you land on.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script                     | What it does                                                     |
| -------------------------- | ---------------------------------------------------------------- |
| `npm run dev`              | Development server                                                |
| `npm run dev:lan`          | Development server, reachable from other devices on the network   |
| `npm run build`            | Static export to `out/` — plain HTML/CSS/JS, no server needed     |
| `npm run preview`          | Serves the built `out/` over the LAN for testing on a real phone  |
| `npm test`                 | Game-logic tests (Node's built-in runner, no build step)          |
| `npm run typecheck`        | `tsc --noEmit`                                                    |
| `npm run generate:puzzles` | Rebuilds every `data/puzzles<N>.json` and `data/words<N>.json`    |
| `npm run verify:puzzles`   | Re-solves every shipped puzzle against the shipped dictionary     |

Both data scripts take a list of sizes to work on, which is how you iterate on one of them without
waiting for the rest:

```bash
npm run generate:puzzles -- 6 7    # rebuild only the two big datasets
npm run verify:puzzles -- 7 --show # re-solve the 7x7 set and print one answer
```

### Testing on a phone

```bash
npm run dev:lan               # then open http://<your-lan-ip>:3000 on the phone
npm run build && npm run preview   # or test the real static build
```

Both scripts print the LAN address to use. Two things make this fail in ways that look like a bug
in the game, so they are handled rather than left to be rediscovered:

- **The dev server rejects cross-origin requests for `/_next/*`.** Next serves the React and
  application chunks with `crossorigin`, so the browser sends an `Origin` header, and only
  `localhost` is trusted by default. Stylesheets carry no `crossorigin` and are served normally, so
  a phone gets a fully styled page that never hydrates — a permanent *"Loading today's grid…"* with
  nothing in the UI to explain it. `allowedDevOrigins` in [next.config.mjs](next.config.mjs) picks
  up this machine's own LAN addresses at startup; `NEXT_DEV_ORIGINS` adds anything else.
- **Ad-hoc static servers mislabel `.js`.** WebKit refuses to execute a script served as
  `text/plain`, which on Windows is a common default. `scripts/preview.mjs` sets the types itself.

## How it works

**No backend, anywhere.** The puzzle of the day is a pure function of the visitor's local calendar
date and the size they picked, so every device derives the same grid independently.

- `lib/date.ts` turns `new Date()` into a local `YYYY-MM-DD` key (never UTC, so the grid changes at
  *your* midnight) and counts days since launch for the puzzle number.
- `lib/random.ts` hashes that key with FNV-1a and seeds a mulberry32 PRNG.
- `lib/puzzle.ts` picks the day's grid. Rather than `seed % length` — which would replay puzzles at
  random within weeks — each pass through a dataset is its own seeded shuffle, so every puzzle in it
  is played before any repeats. The size is part of the seed, so the four sequences do not move in
  lockstep.
- `lib/data.ts` fetches a size's puzzles and dictionary on demand (see below) and registers them.
- `lib/game.ts` holds the rules as pure functions over a `GameState`: place, remove, move, and a
  2N-line evaluation that runs on every drop.
- `lib/layout.ts` derives the on-screen metrics for a board — width, type size, gaps — from one
  formula, so a 7×7 does not arrive wearing 4×4's proportions.
- `lib/storage.ts` writes the board to `localStorage` on every mutation, partitioned by size, and
  rebuilds the bank from the board on restore so the two can never drift apart.

Because the grid depends on the visitor's clock, the board renders only after mount — the
pre-rendered HTML cannot know what day it is where you are. That makes scripting a hard
requirement, so [app/layout.tsx](app/layout.tsx) carries a `<noscript>` saying so instead of
leaving the loading line up forever.

### Loading one size at a time

The four dictionaries come to about three quarters of a megabyte between them — more than the rest
of the application put together. Bundling all four would mean a visitor who only ever plays 4×4
downloading the 33,000-word seven-letter list to do it, so each size is a separate dynamic import
(`data/size<N>.ts`) that the bundler emits as its own chunk. Switching size fetches that chunk once
and caches it for the session; `useVowelMovement` holds the board at a neutral skeleton until it
lands.

### The puzzle data

`data/puzzles<N>.json` holds pre-validated word squares: grids where every row and every column is a
dictionary word, and where every line holds a permitted number of vowels. Blanking the vowels leaves
the consonant skeleton and turns the removed vowels into the day's bank.

| Size | Puzzles | Blanks | Dictionary | Chunk       | Form                  |
| ---- | ------: | -----: | ---------: | ----------: | --------------------- |
| 4×4  |     604 |      8 |      5,468 | 24 + 37 KB  | double word square    |
| 5×5  |     734 |  10–13 |     12,575 | 38 + 98 KB  | double word square    |
| 6×6  |     800 |  12–17 |     22,339 | 53 + 196 KB | double word square    |
| 7×7  |     500 |  15–21 |     33,192 | 41 + 324 KB | symmetric word square |

Every size carries more than a year of dailies, so no puzzle repeats before the calendar comes round
again. 4×4 keeps its original shape exactly — two vowels in every line, eight consonants, eight
blanks; the larger sizes allow two or three vowels per line, which is what makes them findable at
all.

`scripts/generate-puzzles.mjs` finds them by filling the grid one *letter* at a time against a trie
of the word pool: at each cell the legal letters are the intersection of what the row prefix allows
and what the column prefix allows, which is a single `&` of two 26-bit masks, so dead branches die
two letters in rather than after a whole word is committed. Most first rows extend to nothing at
all and the ones that work give up a square quickly, so each first row gets a fixed node budget and
is then abandoned — failing fast finds several times more squares per second than exhausting any one
branch. A *pass* is one sweep over every candidate first row with its own shuffled letter ordering;
passes are deterministic from their index alone, which is what lets them be handed out across worker
threads and still reassemble into a reproducible dataset.

Squares are then de-duplicated against their own transposes, ranked by how common their words are on
the `wordlist-english` frequency tiers, and selected with a cap on how often any single word may
reappear across the set. 4×4 and 5×5 are built from common vocabulary only; 6×6 and 7×7 have to draw
their generation pool from the whole dictionary, because restricting it to the common tiers yields
almost nothing at those sizes — the frequency ranking is what pulls the everyday grids back to the
front.

One prune does most of the work from 6×6 up: when a row or column is completed the word is *claimed*,
and any square that would repeat it dies on the spot. Left to itself the search drifts into squares
that repeat themselves — at 6×6, 881 of 2,071 squares found have a word appearing twice and 340 are
outright symmetric — and claiming words as it goes keeps it on genuine double squares instead of
generating those and throwing them away afterwards.

Obscenities are filtered out of the dictionary with the
[`obscenity`](https://www.npmjs.com/package/obscenity) package rather than a list kept in this
repository. The match has to span the whole word: `obscenity` scans for substrings, which is right
for free text but would cost a dictionary *cockpit*, *annals*, *assort* and *rapped* for containing
someone else's letters.

Solutions are deliberately not shipped — the app only ever needs to ask "are all 2N lines words?",
and the answer key would be one devtools tab away.

`scripts/verify-puzzles.mjs` independently re-solves every shipped puzzle against the shipped
dictionary. It is the check that matters: it tests the data the app actually loads, not the data the
generator thinks it wrote. It earned its keep — an early version of the rewritten generator quietly
emitted 47 unsolvable 4×4 grids, because a column opened by a letter no pool word begins with was
restarting from the trie root and being validated as a three-letter word.

#### Why 7×7 is a mirror

Sizes 4, 5 and 6 ship *double* word squares: 2N different words, the N across having nothing to do
with the N down. At order 7 those effectively stop existing at this vocabulary size. Sweeping 4,000
first rows with a half-million-node budget each turns up 21 squares and every one of them is
symmetric — the grid equals its own transpose, so column *i* spells the same word as row *i*.
Widening to a five-million-node budget with repeats forbidden outright finds none at all. That is
the known shape of the problem: order-7 double word squares need a lexicon far larger than the
33,000 seven-letter words here.

So 7×7 ships the classic symmetric word square instead. The rule of the game is untouched — every
row and every column is a dictionary word — and the mirror is what makes a 49-cell grid humane:
solving one side of the diagonal solves the other with it. The in-game help says so rather than
leaving it as a trap for players who do not spot it.

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
  to place, <kbd>Backspace</kbd> to clear, <kbd>Enter</kbd> to spend the armed token. The size picker
  is a real radio group, so arrow keys move between board sizes.

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
lib/          date, random, puzzle, data, dictionary, game rules, layout, storage, share
data/         Generated: puzzles<N>.json and words<N>.json, plus the size<N>.ts chunk entries
scripts/      Puzzle generator, verifier, and the alias hook that lets Node run the TS tests
tests/        Game-logic tests, run against all four datasets
```

Dictionary and word-frequency data come from [`word-list`](https://www.npmjs.com/package/word-list)
and [`wordlist-english`](https://www.npmjs.com/package/wordlist-english), and the obscenity filter
from [`obscenity`](https://www.npmjs.com/package/obscenity). All three are used at generation time
only — none of them ships in the bundle.
