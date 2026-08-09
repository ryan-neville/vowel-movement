/**
 * Tiny deterministic PRNG helpers. Everything the game randomises is derived
 * from the calendar date, so the same date always produces the same result on
 * every device with no backend involved.
 */

/** FNV-1a: turns a date string such as "2026-08-09" into a 32-bit seed. */
export function dateToSeed(dateKey: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < dateKey.length; i++) {
    hash ^= dateKey.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 - small, fast, and good enough for picking a puzzle. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates driven by the seeded RNG. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
