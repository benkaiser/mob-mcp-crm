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
