'use client';

import styles from '@/components/DragGhost.module.css';
import { sourceLetter, type DragState } from '@/hooks/useVowelDrag';

/** The token that rides under the finger or cursor while a drag is in flight. */
export function DragGhost({ drag }: { drag: DragState | null }) {
  if (!drag?.active) return null;
  const letter = sourceLetter(drag.source);
  if (!letter) return null;

  return (
    <div
      className={styles.ghost}
      aria-hidden="true"
      style={{ transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -115%)` }}
    >
      {letter}
    </div>
  );
}
