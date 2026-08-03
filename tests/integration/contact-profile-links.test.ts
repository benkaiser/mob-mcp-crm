import { describe, it, expect } from 'vitest';
import { createTestDatabase, createTestUser, createTestContact } from '../fixtures/test-helpers.js';
import { ContactMethodService } from '../../src/services/contact-methods.js';
import { ContactMethodTypeService } from '../../src/services/contact-method-types.js';
import { getContactProfile } from '../../src/services/contact-profile.js';

/**
 * The contact profile (used by both the MCP `contact_get` tool and the web API)
 * should resolve a ready-to-use deep link for each contact method, honouring
 * built-in defaults and the user's overrides / custom types.
 */
describe('getContactProfile contact-method links', () => {
  it('resolves built-in deep links and honours custom/override templates', () => {
    const db = createTestDatabase();
    const userId = createTestUser(db, { name: 'Owner', email: 'owner@example.com' });
    const contactId = createTestContact(db, userId, { firstName: 'Zoe' });

    const methods = new ContactMethodService(db);
    methods.add({ contact_id: contactId, type: 'phone', value: '0400 123 456' });
    methods.add({ contact_id: contactId, type: 'facebook', value: 'zoe.example' });
    // A fully custom type — no link until the user defines a template.
    methods.add({ contact_id: contactId, type: 'discord' as never, value: 'zoe#1234' });

    let profile = getContactProfile(db, userId, contactId)!;
    const byType = (t: string) => (profile.contact_methods as Array<{ type: string; link: string | null }>).find((m) => m.type === t)!;

    expect(byType('phone').link).toBe('tel:0400123456');
    expect(byType('facebook').link).toBe('https://m.me/zoe.example');
    expect(byType('discord').link).toBeNull();

    // Define a custom template for discord and override facebook → the profile reflects it.
    const types = new ContactMethodTypeService(db);
    types.upsert(userId, { key: 'discord', label: 'Discord', link_template: 'https://discord.com/users/{value}' });
    types.upsert(userId, { key: 'facebook', label: 'Facebook', link_template: 'https://facebook.com/{value}' });

    profile = getContactProfile(db, userId, contactId)!;
    expect(byType('discord').link).toBe('https://discord.com/users/zoe%231234');
    expect(byType('facebook').link).toBe('https://facebook.com/zoe.example');
  });
});
