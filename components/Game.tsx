'use client';

import { useCallback, useEffect, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import styles from '@/components/Game.module.css';
import { Board } from '@/components/Board';
import { DragGhost } from '@/components/DragGhost';
import { VowelBank } from '@/components/VowelBank';
import { useVowelDrag, type DragSource } from '@/hooks/useVowelDrag';
import { useVowelMovement } from '@/hooks/useVowelMovement';
import { formatDateKey } from '@/lib/date';
import { DICTIONARY_SIZE } from '@/lib/dictionary';
import { isBlankCell } from '@/lib/game';
import { PUZZLE_COUNT, isVowel, type Vowel } from '@/lib/puzzle';
import { buildShareText, copyToClipboard } from '@/lib/share';

export function Game() {
  const { puzzle, state, evaluation, stats, ready, vowelsLeft, place, remove, move, reset } =
    useVowelMovement();
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

  const lines = [...evaluation.rows, ...evaluation.columns];
  const validLines = lines.filter((line) => line.status === 'valid').length;
  const brokenLines = lines.filter((line) => line.status === 'invalid').length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Vowel Movement</h1>
        <p className={styles.subtitle}>
          {ready ? `#${puzzle.puzzleNumber} · ${formatDateKey(puzzle.puzzleId)}` : 'Loading today’s grid…'}
        </p>
      </header>

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
              : `${validLines} of 8 lines are words · ${brokenLines} full but wrong · ${vowelsLeft} ${
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
              disabled={state.placements === 0 && vowelsLeft === 8}
            >
              Clear board
            </button>
          </div>

          {state.isWon && (
            <section className={styles.win}>
              <h2 className={styles.winTitle}>Nice movement.</h2>
              <p className={styles.winLine}>
                Puzzle #{puzzle.puzzleNumber} solved in {state.placements}{' '}
                {state.placements === 1 ? 'placement' : 'placements'}
                {stats.currentStreak > 1 ? ` · streak ${stats.currentStreak}` : ''}
              </p>
              <button type="button" className={`${styles.button} ${styles.primary}`} onClick={handleShare}>
                Share results
              </button>
              <p className={styles.winLine} role="status">
                {shareNote ?? ' '}
              </p>
            </section>
          )}
        </>
      ) : (
        <div className={styles.skeleton} aria-hidden="true" />
      )}

      <details className={styles.help}>
        <summary className={styles.helpSummary}>How to play</summary>
        <div className={styles.helpBody}>
          <ul>
            <li>The grid holds 8 fixed consonants and 8 blanks.</li>
            <li>
              Today’s bank has exactly 8 vowel tokens. Spend them all — the counter on each token
              is what you have left.
            </li>
            <li>Drag a vowel into a blank, or tap a vowel then tap a blank. Tap a placed vowel to take it back.</li>
            <li>
              A finished row or column turns green when it is a word and red when it is not. Partly
              filled lines stay neutral.
            </li>
            <li>
              You win when all four rows and all four columns are words. There is no timer and no
              way to lose.
            </li>
          </ul>
          <p>
            Keyboard: focus a blank and press A, E, I, O or U to place, Backspace to clear.
          </p>
        </div>
      </details>

      <footer className={styles.footer}>
        Everyone gets the same grid today · {PUZZLE_COUNT} puzzles · {DICTIONARY_SIZE.toLocaleString()}{' '}
        four-letter words
      </footer>

      <DragGhost drag={drag} />
    </main>
  );
}
