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
 *
 * The fallback is not theoretical on mobile: `navigator.clipboard` is absent
 * on any plain-http origin, which is every phone opening this over a LAN
 * address, so iOS lands here routinely.
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
    area.readOnly = true;
    area.style.position = 'fixed';
    area.style.top = '0';
    area.style.left = '0';
    area.style.opacity = '0';
    // Anything below 16px makes iOS zoom the page when the field takes focus.
    area.style.fontSize = '16px';
    document.body.appendChild(area);

    // iOS Safari ignores select() on a readonly textarea and copies nothing;
    // it only honours a range selected explicitly. Harmless elsewhere.
    area.contentEditable = 'true';
    const range = document.createRange();
    range.selectNodeContents(area);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    area.setSelectionRange(0, text.length);
    area.select();

    const ok = document.execCommand('copy');
    selection?.removeAllRanges();
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
