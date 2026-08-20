'use client';

import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import styles from '@/components/Game.module.css';
import { Board } from '@/components/Board';
import { DragGhost } from '@/components/DragGhost';
import { VowelBank } from '@/components/VowelBank';
import { useVowelDrag, type DragSource } from '@/hooks/useVowelDrag';
import { useVowelMovement } from '@/hooks/useVowelMovement';
import { formatDateKey } from '@/lib/date';
import { dictionarySize } from '@/lib/dictionary';
import { isBlankCell, lineCount } from '@/lib/game';
import { boardStyle } from '@/lib/layout';
import { SIZES, isVowel, puzzleCount, type PuzzleSize, type Vowel } from '@/lib/puzzle';
import { buildShareText, copyToClipboard, sizeLabel } from '@/lib/share';

/** The only size whose grid is a mirror of itself - see the generator's notes. */
const SYMMETRIC_SIZE: PuzzleSize = 7;

export function Game() {
  const {
    size,
    setSize,
    state,
    evaluation,
    stats,
    ready,
    failed,
    vowelsLeft,
    bankSize,
    place,
    remove,
    move,
    reset,
  } = useVowelMovement();
  const [armed, setArmed] = useState<Vowel | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  // A token that has run out cannot stay armed.
  useEffect(() => {
    if (armed && state.currentVowels[armed] <= 0) setArmed(null);
  }, [armed, state.currentVowels]);

  const canDrop = useCallback((index: number) => isBlankCell(state, index), [state]);

  const handleDrop = useCallback(
    (source: DragSource, index: number) => {
      if (source.kind === 'bank') place(index, source.letter);
      else if (source.kind === 'cell') move(source.index, index);
    },
    [move, place]
  );

  const handleTap = useCallback(
    (source: DragSource) => {
      switch (source.kind) {
        // Tapping a placed vowel sends it straight back to the bank.
        case 'cell':
          remove(source.index);
          return;
        // Tapping an empty blank spends the armed token, if there is one.
        case 'empty':
          if (armed) place(source.index, armed);
          return;
        // Tapping a token arms it (or disarms it if it was already armed).
        case 'bank':
          setArmed((current) => (current === source.letter ? null : source.letter));
      }
    },
    [armed, place, remove]
  );

  const { drag, start, handlers } = useVowelDrag({
    onDrop: handleDrop,
    onTap: handleTap,
    canDrop,
  });

  const startFromBank = useCallback(
    (event: ReactPointerEvent<HTMLElement>, letter: Vowel) =>
      start(event, { kind: 'bank', letter }),
    [start]
  );

  const startFromCell = useCallback(
    (event: ReactPointerEvent<HTMLElement>, index: number) => {
      const letter = state.playerGrid[index];
      start(event, isVowel(letter) ? { kind: 'cell', letter, index } : { kind: 'empty', index });
    },
    [start, state.playerGrid]
  );

  /**
   * Keyboard mirrors the pointer: a vowel key fills the focused blank, Enter
   * spends the armed token, Backspace clears. Cells carry no click handler, so
   * Enter and Space have to be handled here rather than arriving as clicks.
   */
  const handleCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const typed = event.key.toUpperCase();
      if (isVowel(typed)) {
        event.preventDefault();
        place(index, typed);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        remove(index);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (state.playerGrid[index]) remove(index);
        else if (armed) place(index, armed);
      }
    },
    [armed, place, remove, state.playerGrid]
  );

  const handleShare = useCallback(async () => {
    const copied = await copyToClipboard(buildShareText(state, stats));
    setShareNote(copied ? 'Copied to clipboard' : 'Copy failed - select the text manually');
    window.setTimeout(() => setShareNote(null), 2500);
  }, [state, stats]);

  const chooseSize = useCallback(
    (next: PuzzleSize) => {
      setArmed(null);
      setSize(next);
    },
    [setSize]
  );

  const lines = [...evaluation.rows, ...evaluation.columns];
  const validLines = lines.filter((line) => line.status === 'valid').length;
  const brokenLines = lines.filter((line) => line.status === 'invalid').length;
  const totalLines = lineCount(state.size);
  const blanks = state.consonantGrid.filter((cell) => cell === '').length;
  const consonants = state.consonantGrid.length - blanks;

  return (
    // The size-dependent metrics are set once here and read all the way down.
    <main className={styles.page} style={boardStyle(size)}>
      <header className={styles.header}>
        <h1 className={styles.title}>Vowel Movement</h1>
        <p className={styles.subtitle}>
          {ready
            ? `${sizeLabel(state.size)} #${state.puzzleNumber} · ${formatDateKey(state.puzzleId)}`
            : 'Loading today’s grid…'}
        </p>
      </header>

      <fieldset className={styles.sizes}>
        <legend className="visually-hidden">Board size</legend>
        {SIZES.map((option) => (
          <label
            key={option}
            className={`${styles.sizeOption} ${option === size ? styles.sizeActive : ''}`}
          >
            <input
              type="radio"
              name="board-size"
              value={option}
              checked={option === size}
              onChange={() => chooseSize(option)}
              className="visually-hidden"
            />
            {sizeLabel(option)}
          </label>
        ))}
      </fieldset>

      {failed && (
        <p className={styles.error} role="alert">
          Today’s {sizeLabel(size)} grid could not be loaded. Check your connection and reload.
        </p>
      )}

      {ready ? (
        <>
          <Board
            state={state}
            evaluation={evaluation}
            drag={drag}
            armed={armed !== null}
            onCellPointerDown={startFromCell}
            dragHandlers={handlers}
            onCellKeyDown={handleCellKeyDown}
          />

          <p className={`${styles.status} ${state.isWon ? styles.statusWin : ''}`} role="status">
            {state.isWon
              ? 'Solved — every row and column is a word.'
              : `${validLines} of ${totalLines} lines are words · ${brokenLines} full but wrong · ${vowelsLeft} ${
                  vowelsLeft === 1 ? 'vowel' : 'vowels'
                } left`}
          </p>

          <VowelBank
            counts={state.currentVowels}
            initial={state.initialVowels}
            armed={armed}
            onPointerDown={startFromBank}
            dragHandlers={handlers}
          />

          <div className={styles.controls}>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                setArmed(null);
                reset();
              }}
              disabled={state.placements === 0 && vowelsLeft === bankSize}
            >
              Clear board
            </button>
          </div>

          {state.isWon && (
            <section className={styles.win}>
              <h2 className={styles.winTitle}>Nice movement.</h2>
              <p className={styles.winLine}>
                {sizeLabel(state.size)} puzzle #{state.puzzleNumber} solved in {state.placements}{' '}
                {state.placements === 1 ? 'placement' : 'placements'}
                {stats.currentStreak > 1 ? ` · streak ${stats.currentStreak}` : ''}
              </p>
              <button
                type="button"
                className={`${styles.button} ${styles.primary}`}
                onClick={handleShare}
              >
                Share results
              </button>
              <p className={styles.winLine} role="status">
                {/* Non-breaking space, so the line keeps its height and the panel
                    does not jump when the copy confirmation appears. */}
                {shareNote ?? ' '}
              </p>
            </section>
          )}
        </>
      ) : (
        !failed && <div className={styles.skeleton} aria-hidden="true" />
      )}

      <details className={styles.help}>
        <summary className={styles.helpSummary}>How to play</summary>
        <div className={styles.helpBody}>
          <ul>
            {ready && (
              <li>
                The {sizeLabel(state.size)} grid holds {consonants} fixed consonants and {blanks}{' '}
                blanks.
              </li>
            )}
            <li>
              The bank holds exactly one vowel token per blank
              {ready ? `, ${bankSize} of them today` : ''}. Spend them all — the counter on each
              token is what you have left.
            </li>
            <li>
              Drag a vowel into a blank, or tap a vowel then tap a blank. Tap a placed vowel to take
              it back.
            </li>
            <li>
              A finished row or column turns green when it is a word and red when it is not. Partly
              filled lines stay neutral.
            </li>
            <li>
              You win when all {state.size} rows and all {state.size} columns are words. There is no
              timer and no way to lose.
            </li>
            {size === SYMMETRIC_SIZE && (
              <li>
                The {sizeLabel(SYMMETRIC_SIZE)} grid is a mirror: row 1 spells the same word as
                column 1, row 2 the same as column 2, and so on. Solve one half of the diagonal and
                the other comes with it.
              </li>
            )}
            <li>
              Each size is its own daily puzzle, with its own streak. Switching between them costs
              you nothing — every board is saved where you left it.
            </li>
          </ul>
          <p>Keyboard: focus a blank and press A, E, I, O or U to place, Backspace to clear.</p>
        </div>
      </details>

      <footer className={styles.footer}>
        {ready
          ? `Everyone gets the same grid today · ${puzzleCount(state.size)} ${sizeLabel(
              state.size
            )} puzzles · ${dictionarySize(state.size).toLocaleString()} ${state.size}-letter words`
          : 'Everyone gets the same grid today'}
      </footer>

      <DragGhost drag={drag} />
    </main>
  );
}
