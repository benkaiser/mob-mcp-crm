/**
 * Turn a snake_case value into a human-readable label
 * (e.g. `in_person` → `In person`). Safe against null/undefined so it can never
 * throw while rendering a list row with missing/partial data.
 */
export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  const spaced = String(value).replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Plural unit noun for a recurring reminder's frequency. */
const RECURRENCE_UNITS: Record<string, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
};

/**
 * Human-readable recurrence label for a reminder, e.g. `One-time`, `Weekly`,
 * or `Every 6 weeks`. `interval` defaults to 1 (a plain frequency).
 */
export function formatRecurrence(frequency: string, interval: number | null | undefined = 1): string {
  if (frequency === 'one_time') return 'One-time';
  const n = interval && interval > 1 ? interval : 1;
  const unit = RECURRENCE_UNITS[frequency];
  if (!unit) return humanize(frequency);
  if (n === 1) return humanize(frequency);
  return `Every ${n} ${unit}s`;
}
