import { describe, it, expect } from 'vitest';
import { buildContactMethodLink } from '../../src/services/contact-method-types.js';

describe('buildContactMethodLink', () => {
  it('builds every built-in default link with value transforms', () => {
    expect(buildContactMethodLink('email', 'person@example.com')).toBe('mailto:person@example.com');
    expect(buildContactMethodLink('phone', '+1 555 123 0001')).toBe('tel:+15551230001');
    expect(buildContactMethodLink('whatsapp', '+1 (555) 123-0001')).toBe('https://wa.me/15551230001');
    expect(buildContactMethodLink('telegram', '@bluey')).toBe('https://t.me/bluey');
    expect(buildContactMethodLink('signal', '+15551230001')).toBe('https://signal.me/#p/%2B15551230001');
    expect(buildContactMethodLink('twitter', '@bandit')).toBe('https://x.com/bandit');
    expect(buildContactMethodLink('instagram', '@chilli')).toBe('https://instagram.com/chilli');
    expect(buildContactMethodLink('facebook', 'bingo.heeler')).toBe('https://m.me/bingo.heeler');
    expect(buildContactMethodLink('linkedin', 'jane-doe')).toBe('https://www.linkedin.com/in/jane-doe');
    expect(buildContactMethodLink('website', 'example.com')).toBe('https://example.com');
    expect(buildContactMethodLink('website', 'https://example.com/a')).toBe('https://example.com/a');
    expect(buildContactMethodLink('other', 'anything')).toBeNull();
  });

  it('uses custom templates and encodes substituted values where appropriate', () => {
    expect(buildContactMethodLink('mastodon', '@ben example', 'https://social.example/@{value}')).toBe('https://social.example/@%40ben%20example');
    expect(buildContactMethodLink('phone', '+1 555 123', 'sms:{value}')).toBe('sms:+1555123');
  });

  it('returns null for no-link and unsafe cases without throwing', () => {
    expect(buildContactMethodLink('email', '')).toBeNull();
    expect(buildContactMethodLink('email', 'a@example.com', null)).toBeNull();
    expect(buildContactMethodLink('email', 'a@example.com', 'mailto:missing-placeholder')).toBeNull();
    expect(buildContactMethodLink('custom', 'alert(1)', 'javascript:{value}')).toBeNull();
    expect(buildContactMethodLink('website', 'javascript:alert(1)')).toBeNull();
  });
});
