'use client';

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Vowel } from '@/lib/puzzle';

export type DragSource =
  | { kind: 'bank'; letter: Vowel }
  | { kind: 'cell'; letter: Vowel; index: number }
  /** An empty blank: nothing to drag, but it can still be tapped. */
  | { kind: 'empty'; index: number };

export const sourceLetter = (source: DragSource): Vowel | null =>
  source.kind === 'empty' ? null : source.letter;

export interface DragState {
  source: DragSource;
  x: number;
  y: number;
  /** False until the pointer has moved far enough to count as a drag, not a tap. */
  active: boolean;
  /** Index of the droppable cell currently under the pointer. */
  over: number | null;
}

interface Options {
  onDrop: (source: DragSource, cellIndex: number) => void;
  onTap: (source: DragSource) => void;
  canDrop: (cellIndex: number) => boolean;
}

/** Pointer travel (px) before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 6;

/** Which grid cell, if any, sits under the given viewport point. */
function cellUnder(x: number, y: number): number | null {
  const target = document.elementFromPoint(x, y);
  const cell = target?.closest<HTMLElement>('[data-cell-index]');
  if (!cell) return null;
  const index = Number(cell.dataset.cellIndex);
  return Number.isInteger(index) ? index : null;
}

/**
 * One gesture implementation for mouse, pen and touch via Pointer Events.
 *
 * Pointer capture keeps every move and release on the element the gesture
 * started from, so there is no window-level listener juggling, and a press that
 * never travels far enough is reported as a tap instead.
 *
 * Everything - drags and taps alike - runs through here rather than through
 * `click`. Chrome still emits a click after a pointer sequence even when
 * pointerdown was cancelled, and that stray click used to re-fire the move it
 * had just completed (dropping a token, then immediately placing a second one).
 */
export function useVowelDrag({ onDrop, onTap, canDrop }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Mirrored in a ref so the release handler can act on the gesture without
  // running side effects inside a state updater.
  const dragRef = useRef<DragState | null>(null);
  const origin = useRef<{ x: number; y: number; pointerId: number } | null>(null);

  const update = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const start = useCallback(
    (event: ReactPointerEvent<HTMLElement>, source: DragSource) => {
      if (event.button !== 0) return;
      // Cancels text selection and native image dragging; the focus that
      // mousedown would normally have given us is restored by hand.
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      update({ source, x: event.clientX, y: event.clientY, active: false, over: null });
    },
    [update]
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const from = origin.current;
      const current = dragRef.current;
      if (!from || !current || from.pointerId !== event.pointerId) return;

      const travelled = Math.hypot(event.clientX - from.x, event.clientY - from.y);
      const active = current.active || travelled > DRAG_THRESHOLD;
      update({
        ...current,
        x: event.clientX,
        y: event.clientY,
        active,
        over: active ? cellUnder(event.clientX, event.clientY) : null,
      });
    },
    [update]
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      const from = origin.current;
      const current = dragRef.current;
      if (!from || from.pointerId !== event.pointerId) return;
      origin.current = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      update(null);
      if (!current || cancelled) return;

      if (!current.active) {
        onTap(current.source);
        return;
      }
      const target = cellUnder(event.clientX, event.clientY);
      if (target !== null && canDrop(target)) onDrop(current.source, target);
    },
    [canDrop, onDrop, onTap, update]
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
    [finish]
  );
  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
    [finish]
  );

  return { drag, start, handlers: { onPointerMove, onPointerUp, onPointerCancel } };
}
