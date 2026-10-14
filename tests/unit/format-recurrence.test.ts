import { describe, it, expect } from 'vitest';
import { formatRecurrence } from '../../web/src/lib/humanize.js';

describe('formatRecurrence', () => {
  it('labels a one-time reminder', () => {
    expect(formatRecurrence('one_time', 1)).toBe('One-time');
  });

  it('labels simple (interval 1) frequencies', () => {
    expect(formatRecurrence('daily', 1)).toBe('Daily');
    expect(formatRecurrence('weekly', 1)).toBe('Weekly');
    expect(formatRecurrence('monthly', 1)).toBe('Monthly');
    expect(formatRecurrence('yearly', 1)).toBe('Yearly');
  });

  it('labels custom intervals as "Every N units"', () => {
    expect(formatRecurrence('weekly', 6)).toBe('Every 6 weeks');
    expect(formatRecurrence('daily', 10)).toBe('Every 10 days');
    expect(formatRecurrence('monthly', 3)).toBe('Every 3 months');
    expect(formatRecurrence('yearly', 2)).toBe('Every 2 years');
  });

  it('treats a missing or 1 interval as simple', () => {
    expect(formatRecurrence('weekly', undefined)).toBe('Weekly');
  });

  it('ignores interval for one-time reminders', () => {
    expect(formatRecurrence('one_time', 6)).toBe('One-time');
  });
});
