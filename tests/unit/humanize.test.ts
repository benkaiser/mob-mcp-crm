import { describe, it, expect } from 'vitest';
import { humanize } from '../../web/src/lib/humanize';

/**
 * Regression: `humanize` is used in list/detail render paths where a field may
 * be missing from an API row. It must never throw on null/undefined (a thrown
 * render used to leave stale DOM and stack overview pages on top of each other).
 */
describe('humanize', () => {
  it('turns snake_case into a capitalized label', () => {
    expect(humanize('in_person')).toBe('In person');
    expect(humanize('one_time')).toBe('One time');
    expect(humanize('active')).toBe('Active');
  });

  it('returns empty string for null/undefined/empty without throwing', () => {
    expect(() => humanize(undefined)).not.toThrow();
    expect(() => humanize(null)).not.toThrow();
    expect(humanize(undefined)).toBe('');
    expect(humanize(null)).toBe('');
    expect(humanize('')).toBe('');
  });
});
