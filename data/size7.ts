import puzzles from '@/data/puzzles7.json' with { type: 'json' };
import words from '@/data/words7.json' with { type: 'json' };

/** Bundled as its own chunk so only the size being played is downloaded. */
export default { puzzles, words };
