import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AccountService, AccountError } from '../../src/auth/accounts.js';
import { createTestDatabase } from '../fixtures/test-helpers.js';
import { closeDatabase } from '../../src/db/connection.js';

describe('AccountService - self-service', () => {
  let db: Database.Database;
  let service: AccountService;
  let userId: string;

  beforeEach(async () => {
    db = createTestDatabase();
    service = new AccountService(db);
    const user = await service.createAccount({ name: 'Ada Lovelace', email: 'ada@example.com', password: 'password123' });
    userId = user.id;
  });

  afterEach(() => closeDatabase(db));

  describe('changePassword', () => {
    it('changes the password when the current one is correct', async () => {
      await service.changePassword(userId, 'password123', 'newpassword456');
      expect(await service.login('ada@example.com', 'newpassword456')).not.toBeNull();
      expect(await service.login('ada@example.com', 'password123')).toBeNull();
    });

    it('rejects a wrong current password', async () => {
      await expect(service.changePassword(userId, 'wrong', 'newpassword456'))
        .rejects.toMatchObject({ code: 'invalid_password' });
    });

    it('rejects a too-short new password', async () => {
      await expect(service.changePassword(userId, 'password123', 'short'))
        .rejects.toMatchObject({ code: 'weak_password' });
    });
  });

  describe('password reset', () => {
    it('creates a token and resets the password', async () => {
      const result = service.createPasswordResetToken('ada@example.com');
      expect(result).not.toBeNull();
      const affected = await service.resetPassword(result!.token, 'brandnewpass');
      expect(affected).toBe(userId);
      expect(await service.login('ada@example.com', 'brandnewpass')).not.toBeNull();
    });

    it('returns null for an unknown email (no enumeration)', () => {
      expect(service.createPasswordResetToken('nobody@example.com')).toBeNull();
    });

    it('rejects a reused token', async () => {
      const result = service.createPasswordResetToken('ada@example.com')!;
      await service.resetPassword(result.token, 'brandnewpass');
      await expect(service.resetPassword(result.token, 'anotherpass'))
        .rejects.toBeInstanceOf(AccountError);
    });

    it('rejects an invalid token', async () => {
      await expect(service.resetPassword('deadbeef', 'brandnewpass'))
        .rejects.toMatchObject({ code: 'invalid_token' });
    });
  });

  describe('email verification', () => {
    it('marks the email verified when a signup token is consumed', () => {
      expect(service.getVerification(userId).email_verified).toBe(false);
      const token = service.createEmailVerificationToken(userId);
      service.verifyEmailToken(token);
      expect(service.getVerification(userId).email_verified).toBe(true);
    });

    it('swaps in a pending email on an email-change confirmation', () => {
      const { token } = service.requestEmailChange(userId, 'ada2@example.com');
      expect(service.getVerification(userId).pending_email).toBe('ada2@example.com');
      const { email } = service.verifyEmailToken(token);
      expect(email).toBe('ada2@example.com');
      expect(service.getPublicUser(userId)!.email).toBe('ada2@example.com');
      expect(service.getVerification(userId).pending_email).toBeNull();
    });

    it('rejects an email change to an address already in use', async () => {
      await service.createAccount({ name: 'Other', email: 'taken@example.com', password: 'password123' });
      expect(() => service.requestEmailChange(userId, 'taken@example.com'))
        .toThrow(/already exists/i);
    });

    it('rejects an expired/invalid verification token', () => {
      expect(() => service.verifyEmailToken('nope')).toThrow(AccountError);
    });
  });

  describe('updateName', () => {
    it('updates the display name', () => {
      service.updateName(userId, 'Ada L.');
      expect(service.getPublicUser(userId)!.name).toBe('Ada L.');
    });

    it('rejects an empty name', () => {
      expect(() => service.updateName(userId, '   ')).toThrow(AccountError);
    });
  });

  describe('deleteAccount', () => {
    it('hard-deletes the user and cascades owned data', () => {
      // Seed a contact to prove cascade.
      db.prepare("INSERT INTO contacts (id, user_id, first_name) VALUES ('c1', ?, 'X')").run(userId);
      expect(service.deleteAccount(userId)).toBe(true);
      expect(service.getPublicUser(userId)).toBeNull();
      const contact = db.prepare('SELECT id FROM contacts WHERE id = ?').get('c1');
      expect(contact).toBeUndefined();
    });

    it('verifyPassword gates deletion re-auth', async () => {
      expect(await service.verifyPassword(userId, 'password123')).toBe(true);
      expect(await service.verifyPassword(userId, 'wrong')).toBe(false);
    });
  });
});
