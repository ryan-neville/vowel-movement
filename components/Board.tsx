'use client';

import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import styles from '@/components/Board.module.css';
import {
  GRID_SIZE,
  cellIndex,
  type BoardEvaluation,
  type GameState,
  type LineStatus,
} from '@/lib/game';
import { sourceLetter, type DragState } from '@/hooks/useVowelDrag';

interface DragHandlers {
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

interface BoardProps {
  state: GameState;
  evaluation: BoardEvaluation;
  drag: DragState | null;
  /** A bank token is armed, so empty cells are one tap away from being filled. */
  armed: boolean;
  onCellPointerDown: (event: ReactPointerEvent<HTMLElement>, index: number) => void;
  dragHandlers: DragHandlers;
  onCellKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

/** Blend the verdicts of the row and the column a cell sits in. */
function cellTint(row: LineStatus, column: LineStatus): string {
  if (row === 'invalid' || column === 'invalid') return styles.invalid;
  if (row === 'valid' && column === 'valid') return styles.valid;
  if (row === 'valid' || column === 'valid') return styles.half;
  return '';
}

function flagClass(status: LineStatus): string {
  if (status === 'valid') return styles.flagValid;
  if (status === 'invalid') return styles.flagInvalid;
  if (status === 'partial') return styles.flagPartial;
  return '';
}

const ordinal = (n: number) => `${n + 1}`;

/**
 * The 4x4 grid plus an outer track of verdict pills - one to the right of each
 * row, one below each column. Screen readers get the same information from the
 * live summary in the page, so the pills themselves are decorative.
 */
export function Board({
  state,
  evaluation,
  drag,
  armed,
  onCellPointerDown,
  dragHandlers,
  onCellKeyDown,
}: BoardProps) {
  const draggingFrom = drag?.active && drag.source.kind === 'cell' ? drag.source.index : null;
  // A gesture that began on an empty cell carries no token, so it lights nothing up.
  const dropTarget = drag?.active && sourceLetter(drag.source) ? drag.over : null;

  return (
    <div className={styles.board}>
      {Array.from({ length: GRID_SIZE }, (_, row) => {
        const rowLine = evaluation.rows[row];

        return (
          <div key={row} style={{ display: 'contents' }}>
            {Array.from({ length: GRID_SIZE }, (_, column) => {
              const index = cellIndex(row, column);
              const consonant = state.consonantGrid[index];
              const vowel = state.playerGrid[index];
              const tint = cellTint(rowLine.status, evaluation.columns[column].status);
              const position = `Row ${ordinal(row)}, column ${ordinal(column)}`;

              if (consonant) {
                return (
                  <div
                    key={index}
                    className={`${styles.cell} ${styles.locked} ${tint}`}
                    aria-label={`${position}: ${consonant}, fixed consonant`}
                  >
                    {consonant}
                  </div>
                );
              }

              const classes = [
                styles.cell,
                vowel ? styles.filled : styles.blank,
                tint,
                dropTarget === index ? styles.droppable : '',
                draggingFrom === index ? styles.lifted : '',
                !vowel && armed ? styles.selectable : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={index}
                  type="button"
                  data-cell-index={index}
                  className={classes}
                  aria-label={`${position}: ${
                    vowel ? `${vowel}, activate to return it to the bank` : 'empty'
                  }`}
                  onPointerDown={(event) => onCellPointerDown(event, index)}
                  {...dragHandlers}
                  onKeyDown={(event) => onCellKeyDown(event, index)}
                >
                  {vowel}
                </button>
              );
            })}

            <span
              aria-hidden="true"
              className={`${styles.flag} ${styles.flagRow} ${flagClass(rowLine.status)}`}
            />
          </div>
        );
      })}

      {evaluation.columns.map((line, column) => (
        <span
          key={`column-${column}`}
          aria-hidden="true"
          className={`${styles.flag} ${styles.flagColumn} ${flagClass(line.status)}`}
        />
      ))}
      <span aria-hidden="true" />
    </div>
  );
}
