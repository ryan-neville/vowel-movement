'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toDateKey } from '@/lib/date';
import {
  createGameState,
  evaluateBoard,
  moveVowel,
  placeVowel,
  removeVowel,
  resetBoard,
  totalVowels,
  type GameState,
} from '@/lib/game';
import { getPuzzleForDate, type Vowel } from '@/lib/puzzle';
import { emptyStats, loadProgress, loadStats, recordWin, saveProgress, type Stats } from '@/lib/storage';

/**
 * Owns the whole game: today's puzzle, the board, the bank and persistence.
 *
 * The board is deliberately not rendered until after mount. The puzzle depends
 * on the visitor's local date, which the pre-rendered static HTML cannot know,
 * so `ready` keeps the first paint neutral instead of hydrating a wrong grid.
 */
export function useVowelMovement() {
  const [dateKey, setDateKey] = useState(() => toDateKey());
  const puzzle = useMemo(() => getPuzzleForDate(dateKey), [dateKey]);

  const [state, setState] = useState<GameState>(() => createGameState(puzzle));
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [ready, setReady] = useState(false);
  const celebratedFor = useRef<string | null>(null);

  // Restore whatever was saved for today (and re-restore if the date rolls over).
  useEffect(() => {
    const fresh = createGameState(puzzle);
    const restored = loadProgress(fresh, puzzle);
    celebratedFor.current = restored.isWon ? puzzle.puzzleId : null;
    setState(restored);
    setStats(loadStats());
    setReady(true);
  }, [puzzle]);

  // Persist on every mutation, as required for refresh-safe progress.
  useEffect(() => {
    if (ready) saveProgress(state);
  }, [ready, state]);

  // Bank the win exactly once per puzzle.
  useEffect(() => {
    if (!ready || !state.isWon || celebratedFor.current === state.puzzleId) return;
    celebratedFor.current = state.puzzleId;
    setStats(recordWin(state.puzzleNumber));
  }, [ready, state.isWon, state.puzzleId, state.puzzleNumber]);

  // Roll over to the next puzzle if the tab is left open past local midnight.
  useEffect(() => {
    const check = () => setDateKey((current) => {
      const today = toDateKey();
      return today === current ? current : today;
    });
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);

  const place = useCallback(
    (index: number, letter: Vowel) => setState((s) => placeVowel(s, index, letter)),
    []
  );
  const remove = useCallback((index: number) => setState((s) => removeVowel(s, index)), []);
  const move = useCallback(
    (from: number, to: number) => setState((s) => moveVowel(s, from, to)),
    []
  );
  const reset = useCallback(() => setState(resetBoard), []);

  const evaluation = useMemo(() => evaluateBoard(state), [state]);
  const vowelsLeft = totalVowels(state.currentVowels);

  return { puzzle, state, evaluation, stats, ready, vowelsLeft, place, remove, move, reset };
}

export type VowelMovement = ReturnType<typeof useVowelMovement>;
