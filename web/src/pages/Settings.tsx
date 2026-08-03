import { useEffect, useState } from 'preact/hooks';
import { Card, Badge, Button, Spinner, EmptyState, ErrorBanner, Modal, ConfirmDialog, Field, Input, Select, CopyField, showToast } from '../ui';
import { user } from '../store/session';
import { loadSession } from '../store/session';
import { ApiError } from '../api/client';
import { errorMessage, formatDate } from '../lib/format';
import { downloadExport } from '../lib/export';
import {
  pushSupported, vapidAvailable, permission, subscribed, subscriptionCount,
  pushBusy, pushError, initPush, subscribe as pushSubscribe, unsubscribe as pushUnsubscribe,
} from '../store/push';
import {
  listTokens, createToken, revokeToken,
  listWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook, listDeliveries,
  toBool, WEBHOOK_EVENTS,
  type ApiToken, type ApiTokenCreated, type Webhook, type WebhookDelivery,
} from '../api/settings';
import {
  changePassword, updateProfile, resendVerification,
  listConnections, revokeConnection,
  listSessions, revokeSession, revokeAllSessions,
  deleteAccount,
  type Connection, type WebSession,
} from '../api/account';
import {
  listCustomRelationshipTypes,
  createCustomRelationshipType,
  deleteCustomRelationshipType,
  type CustomRelationshipType,
} from '../api/relationship-types';

export function Settings() {
  const me = user.value;
  if (!me) return null;
  const ent = me.entitlements;
  const showUsage = me.hosted && me.plan === 'free' && ent.contact_cap != null && ent.contact_cap > 0;

  return (
    <div class="stack">
      <div class="page-header"><h1>Settings</h1></div>

      <ProfileSection />
      <RelationshipTypesSection />

      <Card class="section" data-testid="settings-plan">
        <div class="section__head"><h2>Plan &amp; usage</h2></div>
        <dl class="kv">
          <dt>Contacts</dt>
          <dd>
            {me.usage.contacts}
            {showUsage ? ` / ${ent.contact_cap}` : ''}
            {showUsage && <span class="muted"> (free plan cap)</span>}
            {!showUsage && me.hosted && me.plan === 'free' && <span class="muted"> (beta: uncapped)</span>}
          </dd>
          <dt>Public API</dt><dd>{ent.public_api ? <Badge tone="success">enabled</Badge> : <Badge>unavailable</Badge>}</dd>
          <dt>Webhooks</dt><dd>{ent.webhooks ? <Badge tone="success">enabled</Badge> : <Badge>unavailable</Badge>}</dd>
          <dt>Advanced import</dt><dd>{ent.advanced_import ? <Badge tone="success">enabled</Badge> : <Badge>unavailable</Badge>}</dd>
        </dl>
      </Card>

      <SecuritySection />
      <TokensSection enabled={ent.public_api} />
      <WebhooksSection enabled={ent.webhooks} />
      <PushSection />
      <ConnectionsSection />
      <SessionsSection />
      <ExportSection />
      <DangerZoneSection />
    </div>
  );
}

function RelationshipTypesSection() {
  const [types, setTypes] = useState<CustomRelationshipType[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [inverse, setInverse] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<CustomRelationshipType | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listCustomRelationshipTypes()
      .then(({ data }) => setTypes(data))
      .catch((err) => setError(errorMessage(err, 'Failed to load custom relationship types')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createCustomRelationshipType({
        label: label.trim(),
        inverse_value: inverse.trim() || undefined,
      });
      setLabel('');
      setInverse('');
      showToast('Relationship type added', 'success');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Failed to add relationship type'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteCustomRelationshipType(deleting.id);
      showToast('Relationship type deleted', 'success');
      setDeleting(null);
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete relationship type'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-relationship-types">
      <div class="section__head"><h2>Relationship types</h2></div>
      <p class="muted">Add custom relationship types and their inverse for automatic bidirectional relationships.</p>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {loading ? (
        <Spinner center />
      ) : !types || types.length === 0 ? (
        <EmptyState title="No custom relationship types" description="Built-in types like spouse, sibling and colleague are always available." />
      ) : (
        <div class="list" data-testid="relationship-type-list">
          {types.map((t) => (
            <div key={t.id} class="sub-row" data-testid="relationship-type-row">
              <div class="sub-row__meta">
                <span><strong>{t.label || t.value}</strong> <span class="mono muted">{t.value}</span></span>
                <span class="muted">Inverse: {t.inverse_value.replace(/_/g, ' ')}</span>
              </div>
              <Button variant="danger" size="sm" data-testid="relationship-type-delete" onClick={() => setDeleting(t)}>Delete</Button>
            </div>
          ))}
        </div>
      )}

      <form class="stack" onSubmit={submit} style="margin-top:1rem;">
        <div class="form-grid">
          <Field label="Label" hint="Used to create the stored relationship type automatically.">
            <Input data-testid="relationship-type-label" value={label} placeholder="External mentor" onInput={(e) => setLabel((e.target as HTMLInputElement).value)} required />
          </Field>
          <Field label="Inverse value" hint="Defaults to the label if left blank">
            <Input data-testid="relationship-type-inverse" value={inverse} placeholder="External mentee" onInput={(e) => setInverse((e.target as HTMLInputElement).value)} />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={busy || !label.trim()} data-testid="relationship-type-add">
            {busy ? 'Adding…' : 'Add relationship type'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete relationship type?"
        message={<>Delete <strong>{deleting?.label || deleting?.value}</strong>? Existing relationships keep their stored value.</>}
        confirmLabel="Delete"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════
// Profile (editable name / email / timezone + verification banner)
// ════════════════════════════════════════════════════════════════

/** A small, curated list of common IANA timezones for the picker. */
const TIMEZONES = [
  'UTC', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai',
  'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland',
];

function ProfileSection() {
  const me = user.value;
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [timezone, setTimezone] = useState(me?.timezone ?? 'UTC');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  if (!me) return null;

  // Include the current timezone in the options even if it isn't in our curated list.
  const tzOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  const dirty = name.trim() !== me.name || email.trim() !== me.email || timezone !== me.timezone;

  async function save(e: Event) {
    e.preventDefault();
    if (!me || !dirty || busy) return;
    setBusy(true);
    try {
      const body: { name?: string; email?: string; timezone?: string } = {};
      if (name.trim() !== me.name) body.name = name.trim();
      if (timezone !== me.timezone) body.timezone = timezone;
      if (email.trim() !== me.email) body.email = email.trim();
      const { data } = await updateProfile(body);
      await loadSession();
      if (data?.email_change_pending) {
        showToast(`Confirmation sent to ${data.pending_email}. Your email changes once you confirm it.`, 'success');
      } else {
        showToast('Profile updated', 'success');
      }
    } catch (err) {
      showToast(errorMessage(err, 'Failed to update profile'), 'error');
      // Reset email field on failure so the UI matches server state.
      setEmail(me.email);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setResending(true);
    try {
      await resendVerification();
      showToast('Verification email sent', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to send verification email'), 'error');
    } finally {
      setResending(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-profile">
      <div class="section__head"><h2>Profile</h2></div>

      {!me.email_verified && (
        <div class="callout callout--warning" data-testid="settings-verify-banner">
          <p class="callout__title">Verify your email</p>
          <p style="margin:0 0 0.5rem;">
            {me.pending_email
              ? <>Check <strong>{me.pending_email}</strong> to confirm your new email address.</>
              : <>Please confirm <strong>{me.email}</strong> to secure your account.</>}
          </p>
          <Button size="sm" variant="secondary" onClick={resend} disabled={resending} data-testid="settings-resend-verification">
            {resending ? 'Sending…' : 'Resend verification email'}
          </Button>
        </div>
      )}

      <form onSubmit={save} class="stack" style="margin-top:0.5rem;">
        <Field label="Name">
          <Input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} data-testid="settings-profile-name-input" />
        </Field>
        <Field label="Email" hint={me.email_verified ? undefined : 'Unverified'}>
          <Input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} data-testid="settings-profile-email-input" />
        </Field>
        <Field label="Timezone">
          <Select value={timezone} onChange={(e) => setTimezone((e.target as HTMLSelectElement).value)} data-testid="settings-profile-timezone-input">
            {tzOptions.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </Select>
        </Field>
        <div>
          <dl class="kv" style="margin-bottom:0.75rem;">
            <dt>Plan</dt>
            <dd data-testid="settings-profile-plan"><Badge tone="primary">{me.plan}</Badge>{me.hosted ? ' · hosted' : ' · self-hosted'}</dd>
          </dl>
          <Button type="submit" disabled={!dirty || busy} data-testid="settings-profile-save">
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
          {' '}
          <a href="/web/logout" class="muted" style="margin-left:0.5rem;">Log out</a>
        </div>
      </form>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════
// Security (change password)
// ════════════════════════════════════════════════════════════════

function SecuritySection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) { setError('New passwords do not match'); return; }
    if (next.length < 8) { setError('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      await changePassword({ current_password: current, new_password: next });
      setCurrent(''); setNext(''); setConfirm('');
      showToast('Password changed. Other sessions have been signed out.', 'success');
    } catch (err) {
      setError(errorMessage(err, 'Failed to change password'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-security">
      <div class="section__head"><h2>Password</h2></div>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <form onSubmit={submit} class="stack">
        <Field label="Current password">
          <Input type="password" value={current} onInput={(e) => setCurrent((e.target as HTMLInputElement).value)} data-testid="settings-password-current" />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <Input type="password" value={next} onInput={(e) => setNext((e.target as HTMLInputElement).value)} data-testid="settings-password-new" />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onInput={(e) => setConfirm((e.target as HTMLInputElement).value)} data-testid="settings-password-confirm" />
        </Field>
        <div>
          <Button type="submit" disabled={busy || !current || !next} data-testid="settings-password-save">
            {busy ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════
// Connected AI assistants (OAuth clients)
// ════════════════════════════════════════════════════════════════

function ConnectionsSection() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Connection | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listConnections()
      .then(({ data }) => setConnections(data))
      .catch((err) => setError(errorMessage(err, 'Failed to load connections')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    try {
      await revokeConnection(revoking.client_id);
      showToast('Connection revoked', 'success');
      setRevoking(null);
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to revoke connection'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-connections">
      <div class="section__head"><h2>Connected AI assistants</h2></div>
      <p class="muted">Apps and AI assistants you've connected via OAuth. Revoking a connection immediately cuts off its access.</p>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {loading ? (
        <Spinner center />
      ) : !connections || connections.length === 0 ? (
        <EmptyState title="No connected assistants" description="Connect an AI assistant to Mob to see it here." />
      ) : (
        <div class="list">
          {connections.map((c) => (
            <div key={c.client_id} class="sub-row" data-testid="connection-row">
              <div>
                <strong>{c.client_id}</strong>
                <div class="muted" style="font-size:0.85rem;">
                  {c.last_used_at ? `Last used ${formatDate(c.last_used_at)}` : 'Never used'}
                  {c.token_count > 1 ? ` · ${c.token_count} tokens` : ''}
                </div>
              </div>
              <Button variant="danger" size="sm" data-testid="connection-revoke" onClick={() => setRevoking(c)}>Revoke</Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={revoking !== null}
        title="Revoke connection?"
        message={<>This will immediately disconnect <strong>{revoking?.client_id}</strong>. It will need to be re-authorized to access your data again.</>}
        confirmLabel="Revoke"
        danger
        busy={busy}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════
// Active web sessions
// ════════════════════════════════════════════════════════════════

function SessionsSection() {
  const [sessions, setSessions] = useState<WebSession[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listSessions()
      .then(({ data }) => setSessions(data))
      .catch((err) => setError(errorMessage(err, 'Failed to load sessions')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function revoke(s: WebSession) {
    setBusyId(s.id);
    try {
      await revokeSession(s.id);
      showToast('Session revoked', 'success');
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to revoke session'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function revokeOthers() {
    setRevokingAll(true);
    try {
      const { data } = await revokeAllSessions();
      showToast(data && data.revoked > 0 ? `Signed out ${data.revoked} other session${data.revoked > 1 ? 's' : ''}` : 'No other sessions to sign out', 'success');
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to sign out other sessions'), 'error');
    } finally {
      setRevokingAll(false);
    }
  }

  const hasOthers = (sessions ?? []).some((s) => !s.current);

  return (
    <Card class="section" data-testid="settings-sessions">
      <div class="section__head"><h2>Active sessions</h2></div>
      <p class="muted">Browsers and devices signed in to your account.</p>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {loading ? (
        <Spinner center />
      ) : !sessions || sessions.length === 0 ? (
        <EmptyState title="No active sessions" description="" />
      ) : (
        <>
          <div class="list">
            {sessions.map((s) => (
              <div key={s.id} class="sub-row" data-testid="session-row">
                <div>
                  <strong>{s.user_agent ? shortenUa(s.user_agent) : 'Unknown device'}</strong>
                  {s.current && <> <Badge tone="success">this device</Badge></>}
                  <div class="muted" style="font-size:0.85rem;">
                    {s.ip ? `${s.ip} · ` : ''}Last active {formatDate(s.last_seen_at)}
                  </div>
                </div>
                {!s.current && (
                  <Button variant="danger" size="sm" data-testid="session-revoke" disabled={busyId === s.id} onClick={() => revoke(s)}>
                    {busyId === s.id ? 'Revoking…' : 'Revoke'}
                  </Button>
                )}
              </div>
            ))}
          </div>
          {hasOthers && (
            <div style="margin-top:1rem;">
              <Button variant="secondary" size="sm" disabled={revokingAll} data-testid="sessions-revoke-all" onClick={revokeOthers}>
                {revokingAll ? 'Signing out…' : 'Log out everywhere else'}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Best-effort friendly label from a raw User-Agent string. */
function shortenUa(ua: string): string {
  const browser = /Firefox\/[\d.]+/.test(ua) ? 'Firefox'
    : /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : null;
  const os = /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || ua.slice(0, 40);
}

// ════════════════════════════════════════════════════════════════
// Danger zone (hard account deletion)
// ════════════════════════════════════════════════════════════════

function DangerZoneSection() {
  const me = user.value;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  async function confirmDelete() {
    if (!me) return;
    setError(null);
    setBusy(true);
    try {
      await deleteAccount({ password, confirm_email: confirmEmail });
      // Account and session are gone — send the user to the login page.
      window.location.href = '/web/login';
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete account'));
      setBusy(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-danger">
      <div class="section__head"><h2>Danger zone</h2></div>
      <p class="muted">
        Permanently delete your account and all associated data — contacts, notes, activities,
        reminders and everything else. This <strong>cannot be undone</strong>.
      </p>
      <Button variant="danger" data-testid="account-delete-open" onClick={() => { setOpen(true); setError(null); setPassword(''); setConfirmEmail(''); }}>
        Delete my account
      </Button>

      <Modal
        open={open}
        title="Delete your account?"
        onClose={() => !busy && setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy} data-testid="account-delete-cancel">Cancel</Button>
            <Button
              variant="danger"
              onClick={confirmDelete}
              disabled={busy || password.length === 0 || confirmEmail.trim().toLowerCase() !== me.email.toLowerCase()}
              data-testid="account-delete-confirm"
            >
              {busy ? 'Deleting…' : 'Permanently delete'}
            </Button>
          </>
        }
      >
        <div class="stack">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <p style="margin:0;">This is permanent. All your data will be erased immediately and cannot be recovered.</p>
          <Field label={`Type your email (${me.email}) to confirm`}>
            <Input value={confirmEmail} onInput={(e) => setConfirmEmail((e.target as HTMLInputElement).value)} data-testid="account-delete-email" />
          </Field>
          <Field label="Enter your password">
            <Input type="password" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} data-testid="account-delete-password" />
          </Field>
        </div>
      </Modal>
    </Card>
  );
}

function ExportSection() {
  const [downloading, setDownloading] = useState(false);

  async function onDownload() {
    setDownloading(true);
    try {
      await downloadExport();
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-export">
      <div class="section__head"><h2>Export your data</h2></div>
      <p class="muted">
        Download a full JSON snapshot of all your CRM data — contacts, activities, notes,
        reminders and everything else. This is your complete data, yours to keep.
      </p>
      <Button onClick={onDownload} disabled={downloading} data-testid="settings-export-download">
        {downloading ? 'Preparing…' : 'Download JSON export'}
      </Button>
    </Card>
  );
}

/** Shown in place of management UI if feature gating is reintroduced after beta. */
function UpgradeNotice({ feature }: { feature: string }) {
  return (
    <div class="callout callout--warning">
      <p class="callout__title">Not available on your plan</p>
      <p style="margin:0;">
        {feature} {feature.endsWith('s') ? 'are' : 'is'} not available on your current plan.
        Upgrade to unlock {feature.toLowerCase()}.
      </p>
    </div>
  );
}

/** True if an error is a 403 entitlement/forbidden response. */
function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

// ════════════════════════════════════════════════════════════════
// API tokens
// ════════════════════════════════════════════════════════════════

function TokensSection({ enabled }: { enabled: boolean }) {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(!enabled);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<ApiTokenCreated | null>(null);
  const [revoking, setRevoking] = useState<ApiToken | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listTokens()
      .then(({ data }) => { setTokens(data); setForbidden(false); })
      .catch((err) => {
        if (isForbidden(err)) setForbidden(true);
        else setError(errorMessage(err, 'Failed to load tokens'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  async function onRevoke() {
    if (!revoking) return;
    setRevokeBusy(true);
    try {
      await revokeToken(revoking.id);
      showToast('Token revoked', 'success');
      setRevoking(null);
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to revoke token'), 'error');
    } finally {
      setRevokeBusy(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-tokens">
      <div class="section__head">
        <h2>API tokens</h2>
        {!forbidden && enabled && (
          <Button size="sm" data-testid="token-create-open" onClick={() => { setCreated(null); setShowCreate(true); }}>+ Create token</Button>
        )}
      </div>

      {forbidden ? (
        <UpgradeNotice feature="The public API" />
      ) : (
        <>
          <p class="muted">Personal access tokens for the public API.</p>
          {created && (
            <div class="callout callout--success" data-testid="token-created">
              <p class="callout__title">Copy your new token now</p>
              <p style="margin:0 0 var(--space-2);">
                This is the only time the plaintext token will be shown — you won't see it again.
              </p>
              <CopyField value={created.token} />
            </div>
          )}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {loading ? (
            <Spinner center />
          ) : !tokens || tokens.length === 0 ? (
            <EmptyState title="No tokens yet" description="Create a token to access the public API." />
          ) : (
            <div class="list" data-testid="token-list">
              {tokens.map((t) => (
                <TokenRow key={t.id} token={t} onRevoke={() => setRevoking(t)} />
              ))}
            </div>
          )}
        </>
      )}

      <CreateTokenModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(tok) => { setCreated(tok); setShowCreate(false); load(); }}
      />

      <ConfirmDialog
        open={revoking !== null}
        title="Revoke token"
        danger
        busy={revokeBusy}
        confirmLabel="Revoke"
        message={<>Revoke <strong>{revoking?.name}</strong>? Any clients using it will stop working immediately.</>}
        onConfirm={onRevoke}
        onCancel={() => setRevoking(null)}
      />
    </Card>
  );
}

function TokenRow({ token, onRevoke }: { token: ApiToken; onRevoke: () => void }) {
  const revoked = token.revoked_at !== null;
  return (
    <div class="sub-row" data-testid="token-row" data-token-name={token.name}>
      <div class="sub-row__meta">
        <span>
          <strong>{token.name}</strong>{' '}
          <span class="mono muted">mob_{token.prefix}…</span>{' '}
          {revoked ? <Badge tone="danger">revoked</Badge> : <Badge tone="success">active</Badge>}
        </span>
        <span class="muted">
          scopes: {token.scopes} · created {formatDate(token.created_at)}
          {token.last_used_at ? ` · last used ${formatDate(token.last_used_at)}` : ' · never used'}
        </span>
      </div>
      <div class="sub-row__actions">
        {!revoked && <Button variant="danger" size="sm" data-testid="token-revoke" onClick={onRevoke}>Revoke</Button>}
      </div>
    </div>
  );
}

function CreateTokenModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (t: ApiTokenCreated) => void }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('read,write');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setName(''); setScopes('read,write'); setError(null); }
  }, [open]);

  async function submit() {
    if (!name.trim()) { setError('Name is required'); return; }
    setBusy(true);
    setError(null);
    try {
      const { data } = await createToken({ name: name.trim(), scopes });
      showToast('Token created', 'success');
      onCreated(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to create token'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create API token"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} data-testid="token-create-submit">{busy ? 'Creating…' : 'Create'}</Button>
        </>
      }
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <Field label="Name" htmlFor="token-name" hint="A label to help you recognise this token.">
        <Input
          id="token-name"
          data-testid="token-name-input"
          value={name}
          placeholder="e.g. My laptop script"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </Field>
      <Field label="Scopes" htmlFor="token-scopes">
        <Select id="token-scopes" value={scopes} onChange={(e) => setScopes((e.target as HTMLSelectElement).value)}>
          <option value="read,write">Read &amp; write</option>
          <option value="read">Read only</option>
          <option value="write">Write only</option>
        </Select>
      </Field>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Webhooks
// ══════════���═════════════════════════════════════════════════════

function WebhooksSection({ enabled }: { enabled: boolean }) {
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(!enabled);
  const [showCreate, setShowCreate] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<{ url: string; secret: string } | null>(null);
  const [deleting, setDeleting] = useState<Webhook | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listWebhooks()
      .then(({ data }) => { setHooks(data); setForbidden(false); })
      .catch((err) => {
        if (isForbidden(err)) setForbidden(true);
        else setError(errorMessage(err, 'Failed to load webhooks'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (enabled) load();
  }, [enabled]);

  async function onDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteWebhook(deleting.id);
      showToast('Webhook deleted', 'success');
      setDeleting(null);
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to delete webhook'), 'error');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <Card class="section" data-testid="settings-webhooks">
      <div class="section__head">
        <h2>Webhooks</h2>
        {!forbidden && enabled && (
          <Button size="sm" data-testid="webhook-create-open" onClick={() => { setCreatedSecret(null); setShowCreate(true); }}>+ Add webhook</Button>
        )}
      </div>

      {forbidden ? (
        <UpgradeNotice feature="Webhooks" />
      ) : (
        <>
          <p class="muted">Send CRM events to your own endpoints.</p>
          {createdSecret && (
            <div class="callout callout--success" data-testid="webhook-created">
              <p class="callout__title">Webhook signing secret</p>
              <p style="margin:0 0 var(--space-2);">
                Save this secret for <span class="mono">{createdSecret.url}</span> — use it to verify incoming payloads.
              </p>
              <CopyField value={createdSecret.secret} label="Secret" />
            </div>
          )}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          {loading ? (
            <Spinner center />
          ) : !hooks || hooks.length === 0 ? (
            <EmptyState title="No webhooks yet" description="Add a webhook to receive event notifications." />
          ) : (
            <div class="list" data-testid="webhook-list">
              {hooks.map((h) => (
                <WebhookRow key={h.id} hook={h} onChanged={load} onDelete={() => setDeleting(h)} />
              ))}
            </div>
          )}
        </>
      )}

      <CreateWebhookModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(wh) => { setCreatedSecret({ url: wh.url, secret: wh.secret }); setShowCreate(false); load(); }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete webhook"
        danger
        busy={deleteBusy}
        confirmLabel="Delete"
        message={<>Delete the webhook for <span class="mono">{deleting?.url}</span>?</>}
        onConfirm={onDelete}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

function eventsLabel(events: string[] | '*'): string {
  if (events === '*') return 'all events';
  if (Array.isArray(events)) return events.length ? events.join(', ') : 'no events';
  return String(events);
}

function WebhookRow({ hook, onChanged, onDelete }: { hook: Webhook; onChanged: () => void; onDelete: () => void }) {
  const [toggling, setToggling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const active = toBool(hook.active);

  async function toggleActive() {
    setToggling(true);
    try {
      await updateWebhook(hook.id, { active: !active });
      showToast(active ? 'Webhook disabled' : 'Webhook enabled', 'success');
      onChanged();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to update webhook'), 'error');
    } finally {
      setToggling(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      await testWebhook(hook.id);
      showToast('Test event dispatched', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Failed to send test'), 'error');
    } finally {
      setTesting(false);
    }
  }

  return (
    <div class="sub-row" data-testid="webhook-row" data-webhook-url={hook.url} style="flex-direction:column;align-items:stretch;gap:var(--space-2);">
      <div class="row" style="justify-content:space-between;width:100%;">
        <div class="sub-row__meta">
          <span>
            <span class="mono">{hook.url}</span>{' '}
            {active ? <Badge tone="success">active</Badge> : <Badge>inactive</Badge>}
          </span>
          <span class="muted">events: {eventsLabel(hook.events)} · created {formatDate(hook.created_at)}</span>
        </div>
        <div class="sub-row__actions">
          <Button variant="secondary" size="sm" data-testid="webhook-toggle" onClick={toggleActive} disabled={toggling}>
            {active ? 'Disable' : 'Enable'}
          </Button>
          <Button variant="secondary" size="sm" data-testid="webhook-test" onClick={sendTest} disabled={testing}>
            {testing ? 'Sending…' : 'Send test'}
          </Button>
          <Button variant="ghost" size="sm" data-testid="webhook-deliveries-toggle" onClick={() => setShowDeliveries((v) => !v)}>
            {showDeliveries ? 'Hide deliveries' : 'Deliveries'}
          </Button>
          <Button variant="danger" size="sm" data-testid="webhook-delete" onClick={onDelete}>Delete</Button>
        </div>
      </div>
      {showDeliveries && <DeliveriesView webhookId={hook.id} />}
    </div>
  );
}

function deliveryTone(status: WebhookDelivery['status']): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

function DeliveriesView({ webhookId }: { webhookId: string }) {
  const [rows, setRows] = useState<WebhookDelivery[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listDeliveries(webhookId, 1, 10)
      .then(({ data }) => { if (!cancelled) setRows(data); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load deliveries')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [webhookId]);

  if (loading) return <Spinner center />;
  if (error) return <ErrorBanner message={error} onDismiss={() => setError(null)} />;
  if (!rows || rows.length === 0) return <p class="muted">No deliveries yet.</p>;

  return (
    <div class="list" style="width:100%;">
      {rows.map((d) => (
        <div key={d.id} class="delivery-row">
          <span class="mono">{d.event}</span>
          <Badge tone={deliveryTone(d.status)}>{d.status}</Badge>
          <span class="muted">{d.response_status ?? '—'} · {d.attempts} attempt{d.attempts === 1 ? '' : 's'}</span>
          <span class="muted">{formatDate(d.last_attempt_at ?? d.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function CreateWebhookModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (w: Webhook) => void }) {
  const [url, setUrl] = useState('');
  const [allEvents, setAllEvents] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setUrl(''); setAllEvents(false); setSelected([]); setSecret(''); setError(null); }
  }, [open]);

  function toggleEvent(ev: string) {
    setSelected((cur) => (cur.includes(ev) ? cur.filter((e) => e !== ev) : [...cur, ev]));
  }

  async function submit() {
    const trimmed = url.trim();
    if (!trimmed) { setError('URL is required'); return; }
    try {
      // Validate URL shape client-side before sending.
      new URL(trimmed);
    } catch {
      setError('Enter a valid URL (including https://)');
      return;
    }
    if (!allEvents && selected.length === 0) { setError('Select at least one event (or All events)'); return; }
    setBusy(true);
    setError(null);
    try {
      const { data } = await createWebhook({
        url: trimmed,
        events: allEvents ? '*' : selected,
        secret: secret.trim() || undefined,
      });
      showToast('Webhook created', 'success');
      onCreated(data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to create webhook'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add webhook"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} data-testid="webhook-create-submit">{busy ? 'Creating…' : 'Create'}</Button>
        </>
      }
    >
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <Field label="Endpoint URL" htmlFor="wh-url" hint="HTTPS endpoint that will receive event payloads.">
        <Input
          id="wh-url"
          type="url"
          data-testid="webhook-url-input"
          value={url}
          placeholder="https://example.com/webhooks/mob"
          onInput={(e) => setUrl((e.target as HTMLInputElement).value)}
        />
      </Field>
      <Field label="Events">
        <label style="display:flex;align-items:center;gap:var(--space-1);margin-bottom:var(--space-2);">
          <input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents((e.target as HTMLInputElement).checked)} />
          All events (<span class="mono">*</span>)
        </label>
        {!allEvents && (
          <div class="field-checks" data-testid="webhook-events">
            {WEBHOOK_EVENTS.map((ev) => (
              <label key={ev}>
                <input
                  type="checkbox"
                  data-testid={`webhook-event-${ev}`}
                  checked={selected.includes(ev)}
                  onChange={() => toggleEvent(ev)}
                />
                <span class="mono">{ev}</span>
              </label>
            ))}
          </div>
        )}
      </Field>
      <Field label="Secret (optional)" htmlFor="wh-secret" hint="Leave blank to auto-generate a signing secret.">
        <Input
          id="wh-secret"
          value={secret}
          placeholder="Auto-generated if blank"
          onInput={(e) => setSecret((e.target as HTMLInputElement).value)}
        />
      </Field>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════
// Push notifications
// ════════════════════════════════════════════════════════════════

function permissionBadge(state: typeof permission.value) {
  switch (state) {
    case 'granted':
      return <Badge tone="success">granted</Badge>;
    case 'denied':
      return <Badge tone="danger">denied</Badge>;
    case 'unsupported':
      return <Badge>unsupported</Badge>;
    default:
      return <Badge tone="warning">not requested</Badge>;
  }
}

function PushSection() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void initPush().finally(() => setReady(true));
  }, []);

  const supported = pushSupported.value;
  const vapid = vapidAvailable.value;
  const isOn = subscribed.value;
  const busy = pushBusy.value;
  const err = pushError.value;
  const count = subscriptionCount.value;

  async function enable() {
    const ok = await pushSubscribe();
    if (ok) showToast('Push notifications enabled', 'success');
    else if (pushError.value) showToast(pushError.value, 'error');
  }

  async function disable() {
    const ok = await pushUnsubscribe();
    if (ok) showToast('Push notifications disabled', 'success');
    else if (pushError.value) showToast(pushError.value, 'error');
  }

  return (
    <Card class="section" data-testid="settings-push">
      <div class="section__head">
        <h2>Push notifications</h2>
        {ready && supported && vapid && (
          isOn ? (
            <Button variant="secondary" size="sm" onClick={disable} disabled={busy}>
              {busy ? 'Working…' : 'Disable'}
            </Button>
          ) : (
            <Button size="sm" onClick={enable} disabled={busy || permission.value === 'denied'}>
              {busy ? 'Working…' : 'Enable'}
            </Button>
          )
        )}
      </div>

      <p class="muted">
        Receive reminders and alerts as browser/desktop notifications, even when the app isn't open.
      </p>

      {err && <ErrorBanner message={err} onDismiss={() => { pushError.value = null; }} />}

      {!ready ? (
        <Spinner center />
      ) : !supported ? (
        <EmptyState
          title="Not supported"
          description="This browser doesn't support push notifications."
        />
      ) : vapid === false ? (
        <EmptyState
          title="Not configured"
          description="Push notifications aren't configured on this server (no VAPID keys)."
        />
      ) : (
        <dl class="kv">
          <dt>This device</dt>
          <dd>{isOn ? <Badge tone="success">subscribed</Badge> : <Badge>not subscribed</Badge>}</dd>
          <dt>Permission</dt>
          <dd>{permissionBadge(permission.value)}</dd>
          <dt>Active subscriptions</dt>
          <dd>{count === null ? '—' : count}</dd>
        </dl>
      )}
    </Card>
  );
}
