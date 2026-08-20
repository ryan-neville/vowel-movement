import type { CSSProperties } from 'react';
import type { PuzzleSize } from '@/lib/puzzle';

/**
 * How a board of each size is sized on screen, as custom properties set once on
 * the page and read by every stylesheet below it.
 *
 * Everything is derived from one rule rather than hand-tuned per size: a cell is
 * `boardWidth / size` across, and the letter in it is a fixed fraction of that.
 * Feeding the numbers through the same formula is what stops a 7x7 from arriving
 * with 4x4's type size in 4x4's grid - and the constants are chosen so that the
 * 4x4 board comes out exactly where it always was (25rem wide, 1.35-2rem type,
 * a 5-9px gap).
 */

/** Letter height as a fraction of the cell it sits in. */
const TYPE_RATIO = 0.32;
/** Where in the clamp the small end sits, relative to the large end. */
const TYPE_FLOOR = 0.675;

const round = (value: number) => Math.round(value * 1000) / 1000;

export function boardWidthRem(size: PuzzleSize): number {
  return 25 + (size - 4) * 2;
}

export function boardMetrics(size: PuzzleSize) {
  const board = boardWidthRem(size);
  // The desktop cap, and the viewport-relative size a phone actually gets: at
  // full width a cell is about 100vw/size across, so the type tracks 30/size vw.
  const typeMax = round((TYPE_RATIO * board) / size);
  const typeMin = round(typeMax * TYPE_FLOOR);
  const typeVw = round(30 / size);

  return {
    /** Page container, wide enough that the board is never the thing clamped. */
    pageWidth: `${board + 7}rem`,
    boardWidth: `${board}rem`,
    cellFont: `clamp(${typeMin}rem, ${typeVw}vw, ${typeMax}rem)`,
    cellGap: `clamp(${round(20 / size)}px, ${round(6.4 / size)}vw, ${round(36 / size)}px)`,
    /** Outer grid track holding the row and column verdict pills. */
    flagTrack: `${round(1.36 / size)}fr`,
  };
}

/** The same numbers as CSS custom properties, for the element that owns them. */
export function boardStyle(size: PuzzleSize): CSSProperties {
  const metrics = boardMetrics(size);
  return {
    '--page-width': metrics.pageWidth,
    '--board-width': metrics.boardWidth,
    '--cell-font': metrics.cellFont,
    '--cell-gap': metrics.cellGap,
    '--flag-track': metrics.flagTrack,
  } as CSSProperties;
}
