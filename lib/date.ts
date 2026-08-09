/**
 * Date helpers. The puzzle of the day follows the player's *local* calendar
 * date, so a new grid appears at local midnight rather than at UTC midnight.
 */

/** The date Vowel Movement #1 was published. */
export const LAUNCH_DATE = '2026-01-01';

/** Local calendar date as "YYYY-MM-DD" (never UTC - toISOString would shift it). */
export function toDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Whole days from LAUNCH_DATE to the given key; negative before launch. */
export function daysSinceLaunch(dateKey: string): number {
  const asUtc = (key: string) => {
    const [year, month, day] = key.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  const MS_PER_DAY = 86_400_000;
  return Math.round((asUtc(dateKey) - asUtc(LAUNCH_DATE)) / MS_PER_DAY);
}

/** Human-readable date for the header, e.g. "Sunday, 9 August 2026". */
export function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
