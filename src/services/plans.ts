import type Database from 'better-sqlite3';

// ─── Types ──────────────────────────────────────────────────────

export type PlanName = 'unlimited' | 'free' | 'paid';

export type Feature = 'public_api' | 'webhooks' | 'advanced_import';

export interface Entitlements {
  /** Maximum number of (non-deleted) contacts, or null for unlimited. */
  contactCap: number | null;
  publicApi: boolean;
  webhooks: boolean;
  advancedImport: boolean;
}

export interface Usage {
  contacts: number;
  contactCap: number | null;
  plan: PlanName;
}

/** Raised when a quota is exceeded. Carries an HTTP-friendly status code. */
export class QuotaExceededError extends Error {
  status = 402;
  code = 'quota_exceeded';
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

/** Raised when a plan lacks a required feature. */
export class FeatureNotAvailableError extends Error {
  status = 403;
  code = 'feature_not_available';
  constructor(message: string) {
    super(message);
    this.name = 'FeatureNotAvailableError';
  }
}

// ─── Entitlement tables ─────────────────────────────────────────

const FREE_TIER_CONTACT_CAP = 11;

const UNLIMITED_ENTITLEMENTS: Entitlements = {
  contactCap: null,
  publicApi: true,
  webhooks: true,
  advancedImport: true,
};

const ENTITLEMENTS: Record<PlanName, Entitlements> = {
  unlimited: UNLIMITED_ENTITLEMENTS,
  paid: UNLIMITED_ENTITLEMENTS,
  free: {
    contactCap: FREE_TIER_CONTACT_CAP,
    publicApi: false,
    webhooks: false,
    advancedImport: false,
  },
};

const FEATURE_KEY: Record<Feature, keyof Entitlements> = {
  public_api: 'publicApi',
  webhooks: 'webhooks',
  advanced_import: 'advancedImport',
};

/**
 * Plan and quota enforcement.
 *
 * CRITICAL: gating is only active when the server runs in HOSTED mode.
 * In self-hosted / open-source mode (`hosted = false`) every user is treated
 * as unlimited and every gate is a no-op, regardless of the stored plan value.
 */
export class PlanService {
  constructor(
    private db: Database.Database,
    private hosted: boolean,
  ) {}

  /** Whether this server enforces plans at all. */
  isHosted(): boolean {
    return this.hosted;
  }

  /**
   * The effective plan for a user. Always 'unlimited' when self-hosted.
   */
  getPlan(userId: string): PlanName {
    if (!this.hosted) return 'unlimited';
    const row = this.db.prepare('SELECT plan FROM users WHERE id = ?').get(userId) as { plan?: string } | undefined;
    const plan = row?.plan;
    if (plan === 'free' || plan === 'paid' || plan === 'unlimited') return plan;
    // Unknown/missing → safest default in hosted mode is the free tier.
    return 'free';
  }

  /** Entitlements for a user's effective plan. */
  getEntitlements(userId: string): Entitlements {
    if (!this.hosted) return UNLIMITED_ENTITLEMENTS;
    return ENTITLEMENTS[this.getPlan(userId)];
  }

  /** Whether a feature is enabled for a user. Always true self-hosted. */
  isFeatureEnabled(userId: string, feature: Feature): boolean {
    if (!this.hosted) return true;
    const ent = this.getEntitlements(userId);
    return ent[FEATURE_KEY[feature]] === true;
  }

  /** Throws FeatureNotAvailableError if the feature is gated for this user. */
  requireFeature(userId: string, feature: Feature): void {
    if (this.isFeatureEnabled(userId, feature)) return;
    throw new FeatureNotAvailableError(
      `The "${feature}" feature requires a paid plan. Upgrade to unlock it.`,
    );
  }

  /** Count of the user's non-deleted contacts. */
  private contactCount(userId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) AS count FROM contacts WHERE user_id = ? AND deleted_at IS NULL',
    ).get(userId) as { count: number };
    return row.count;
  }

  /**
   * Throws QuotaExceededError if creating `adding` more contacts would exceed
   * the user's cap. No-op when self-hosted or plan is uncapped.
   */
  enforceContactQuota(userId: string, adding = 1): void {
    if (!this.hosted) return;
    const cap = this.getEntitlements(userId).contactCap;
    if (cap === null) return;
    const current = this.contactCount(userId);
    if (current + adding > cap) {
      throw new QuotaExceededError(
        `Contact limit reached (${cap}). Upgrade to a paid plan to add more contacts.`,
      );
    }
  }

  /** Usage summary for dashboards/settings. */
  getUsage(userId: string): Usage {
    return {
      contacts: this.contactCount(userId),
      contactCap: this.getEntitlements(userId).contactCap,
      plan: this.getPlan(userId),
    };
  }
}
