'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadSize } from '@/lib/data';
import { toDateKey } from '@/lib/date';
import {
  createGameState,
  emptyGameState,
  evaluateBoard,
  moveVowel,
  placeVowel,
  removeVowel,
  resetBoard,
  totalVowels,
  type GameState,
} from '@/lib/game';
import { DEFAULT_SIZE, getPuzzleForDate, type PuzzleSize, type Vowel } from '@/lib/puzzle';
import {
  emptyStats,
  loadPreferredSize,
  loadProgress,
  loadStats,
  recordWin,
  savePreferredSize,
  saveProgress,
  type Stats,
} from '@/lib/storage';

/**
 * Owns the whole game: the chosen board size, today's puzzle for it, the board,
 * the bank and persistence.
 *
 * Nothing is rendered until after mount, and then not until the size's dataset
 * has arrived. The puzzle depends on the visitor's local date, which pre-rendered
 * static HTML cannot know, and on a word list that is fetched on demand - so
 * `ready` keeps the first paint neutral instead of hydrating a wrong grid.
 */
export function useVowelMovement() {
  const [size, setSizeState] = useState<PuzzleSize>(DEFAULT_SIZE);
  const [dateKey, setDateKey] = useState(() => toDateKey());

  const [state, setState] = useState<GameState>(() => emptyGameState(DEFAULT_SIZE));
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preferenceRead, setPreferenceRead] = useState(false);
  const celebrated = useRef<string | null>(null);

  // Reopen on the size the player last chose. localStorage is not readable
  // during the static render - and rendering the picker from it on the first
  // client pass would not match the pre-rendered HTML - so this is a mount
  // effect rather than a state initialiser. Both updates land in one batch.
  useEffect(() => {
    const preferred = loadPreferredSize();
    if (preferred) setSizeState(preferred);
    setPreferenceRead(true);
  }, []);

  // Fetch the dataset for the current size, then restore whatever was saved for
  // today. Re-runs when the size changes or the date rolls over. It waits for
  // the preference so a returning 7x7 player does not fetch 4x4 on the way past.
  useEffect(() => {
    if (!preferenceRead) return;
    let cancelled = false;
    setReady(false);
    setFailed(false);

    loadSize(size)
      .then(() => {
        if (cancelled) return;
        const puzzle = getPuzzleForDate(dateKey, size);
        const restored = loadProgress(createGameState(puzzle), puzzle);
        celebrated.current = restored.isWon ? `${size}:${puzzle.puzzleId}` : null;
        setState(restored);
        setStats(loadStats(size));
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [dateKey, preferenceRead, size]);

  // Persist on every mutation, as required for refresh-safe progress.
  useEffect(() => {
    if (ready) saveProgress(state);
  }, [ready, state]);

  // Bank the win exactly once per puzzle, per size.
  useEffect(() => {
    const key = `${state.size}:${state.puzzleId}`;
    if (!ready || !state.isWon || celebrated.current === key) return;
    celebrated.current = key;
    setStats(recordWin(state.size, state.puzzleNumber));
  }, [ready, state.isWon, state.puzzleId, state.puzzleNumber, state.size]);

  // Roll over to the next puzzle if the tab is left open past local midnight.
  useEffect(() => {
    const check = () =>
      setDateKey((current) => {
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

  const setSize = useCallback((next: PuzzleSize) => {
    setSizeState(next);
    savePreferredSize(next);
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
  const bankSize = totalVowels(state.initialVowels);

  return {
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
  };
}

export type VowelMovement = ReturnType<typeof useVowelMovement>;
