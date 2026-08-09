import { GRID_SIZE, type GameState } from '@/lib/game';
import type { Stats } from '@/lib/storage';

/**
 * The classic spoiler-free brag: a solid green grid proves you closed all four
 * rows and all four columns, and the placement count is the only thing worth
 * competing over in a puzzle with no fail state.
 */
export function buildShareText(state: GameState, stats?: Stats): string {
  const grid = Array.from({ length: GRID_SIZE }, () => '🟩'.repeat(GRID_SIZE)).join('\n');
  const lines = [`Vowel Movement #${state.puzzleNumber}`, '', grid, '', `Placements: ${state.placements}`];
  if (stats && stats.currentStreak > 1) lines.push(`Streak: ${stats.currentStreak}`);
  return lines.join('\n');
}

/**
 * Clipboard API needs a secure context and can be blocked outright, so fall
 * back to the old execCommand trick before giving up.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
