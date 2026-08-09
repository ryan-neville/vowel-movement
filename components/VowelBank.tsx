'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import styles from '@/components/VowelBank.module.css';
import { VOWELS, type Vowel, type VowelCounts } from '@/lib/puzzle';

interface VowelBankProps {
  counts: VowelCounts;
  initial: VowelCounts;
  /** The token waiting to be dropped into the next tapped cell, if any. */
  armed: Vowel | null;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, letter: Vowel) => void;
  dragHandlers: {
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  };
}

/**
 * The day's inventory. Tokens are physical: the counter is the truth about what
 * is left to spend, and a token at zero is inert - no drag, no tap, no keyboard.
 */
export function VowelBank({ counts, initial, armed, onPointerDown, dragHandlers }: VowelBankProps) {
  return (
    <div className={styles.bank}>
      <div className={styles.tokens}>
        {VOWELS.map((letter) => {
          const remaining = counts[letter];
          const dealt = initial[letter];
          const spent = remaining <= 0;

          return (
            <button
              key={letter}
              type="button"
              disabled={spent}
              aria-pressed={armed === letter}
              aria-label={`${letter}: ${remaining} of ${dealt} left${
                spent ? ', none remaining' : ''
              }`}
              className={[styles.token, spent ? styles.spent : '', armed === letter ? styles.armed : '']
                .filter(Boolean)
                .join(' ')}
              onPointerDown={spent ? undefined : (event) => onPointerDown(event, letter)}
              {...(spent ? {} : dragHandlers)}
            >
              {letter}
              <span className={styles.count} aria-hidden="true">
                {remaining}
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.caption}>
        Drag a vowel onto a blank, or tap a vowel then tap a blank.
      </p>
    </div>
  );
}
