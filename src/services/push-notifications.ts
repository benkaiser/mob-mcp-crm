import Database from 'better-sqlite3';
import webpush from 'web-push';
import { generateId } from '../utils.js';

// ─── Types ──────────────────────────────────────────────────────

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

// ─── Service ────────────────────────────────────────────────────

export class PushNotificationService {
  private vapidKeys: VapidKeys | null = null;

  constructor(private db: Database.Database) {}

  /**
   * Initialize VAPID keys - loads from DB or generates new ones.
   */
  initVapid(contactEmail: string): void {
    const publicKeyRow = this.db.prepare(
      "SELECT value FROM server_config WHERE key = 'vapid_public_key'"
    ).get() as { value: string } | undefined;

    const privateKeyRow = this.db.prepare(
      "SELECT value FROM server_config WHERE key = 'vapid_private_key'"
    ).get() as { value: string } | undefined;

    if (publicKeyRow && privateKeyRow) {
      this.vapidKeys = {
        publicKey: publicKeyRow.value,
        privateKey: privateKeyRow.value,
      };
    } else {
      // Generate new VAPID keys
      const keys = webpush.generateVAPIDKeys();
      this.vapidKeys = {
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      };

      const upsert = this.db.prepare(
        'INSERT OR REPLACE INTO server_config (key, value) VALUES (?, ?)'
      );
      upsert.run('vapid_public_key', keys.publicKey);
      upsert.run('vapid_private_key', keys.privateKey);
    }

    webpush.setVapidDetails(
      `mailto:${contactEmail}`,
      this.vapidKeys.publicKey,
      this.vapidKeys.privateKey
    );
  }

  /**
   * Get the VAPID public key for client-side subscription.
   */
  getVapidPublicKey(): string {
    if (!this.vapidKeys) {
      throw new Error('VAPID keys not initialized. Call initVapid() first.');
    }
    return this.vapidKeys.publicKey;
  }

  /**
   * Store a push subscription for a user.
   */
  subscribe(userId: string, subscription: PushSubscriptionInput): PushSubscription {
    // Remove existing subscription with same endpoint
    this.db.prepare(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?'
    ).run(userId, subscription.endpoint);

    const id = generateId();
    this.db.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);

    return this.db.prepare(
      'SELECT * FROM push_subscriptions WHERE id = ?'
    ).get(id) as PushSubscription;
  }

  /**
   * Remove a push subscription.
   */
  unsubscribe(userId: string, endpoint: string): boolean {
    const result = this.db.prepare(
      'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?'
    ).run(userId, endpoint);
    return result.changes > 0;
  }

  /**
   * List all push subscriptions for a user.
   */
  getSubscriptions(userId: string): PushSubscription[] {
    return this.db.prepare(
      'SELECT * FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC'
    ).all(userId) as PushSubscription[];
  }

  /**
   * Send a push notification to all of a user's subscriptions.
   */
  async sendPushNotification(
    userId: string,
    title: string,
    body: string,
    url?: string
  ): Promise<{ sent: number; failed: number }> {
    const subscriptions = this.getSubscriptions(userId);
    let sent = 0;
    let failed = 0;

    const payload = JSON.stringify({ title, body, url });

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        );
        sent++;
      } catch (err: any) {
        failed++;
        // Remove expired/invalid subscriptions (410 Gone or 404)
        if (err.statusCode === 410 || err.statusCode === 404) {
          this.db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        }
      }
    }

    return { sent, failed };
  }
}
