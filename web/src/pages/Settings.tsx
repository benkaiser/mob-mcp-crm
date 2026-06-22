import { useEffect, useState } from 'preact/hooks';
import { Card, Badge, Button, Spinner, EmptyState, ErrorBanner, Modal, ConfirmDialog, Field, Input, Select, CopyField, showToast } from '../ui';
import { user } from '../store/session';
import { ApiError } from '../api/client';
import { errorMessage, formatDate } from '../lib/format';
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

export function Settings() {
  const me = user.value;
  if (!me) return null;
  const ent = me.entitlements;
  const showUsage = me.hosted && me.plan === 'free' && ent.contact_cap > 0;

  return (
    <div class="stack">
      <div class="page-header"><h1>Settings</h1></div>

      <Card class="section" data-testid="settings-profile">
        <div class="section__head"><h2>Profile</h2></div>
        <dl class="kv">
          <dt>Name</dt><dd data-testid="settings-profile-name">{me.name}</dd>
          <dt>Email</dt><dd data-testid="settings-profile-email">{me.email}</dd>
          <dt>Plan</dt><dd data-testid="settings-profile-plan"><Badge tone="primary">{me.plan}</Badge>{me.hosted ? ' · hosted' : ' · self-hosted'}</dd>
        </dl>
        <p style="margin-top:1rem;">
          <a href="/web/logout">Log out</a>
        </p>
      </Card>

      <Card class="section" data-testid="settings-plan">
        <div class="section__head"><h2>Plan &amp; usage</h2></div>
        <dl class="kv">
          <dt>Contacts</dt>
          <dd>
            {me.usage.contacts}
            {showUsage ? ` / ${ent.contact_cap}` : ''}
            {showUsage && <span class="muted"> (free plan cap)</span>}
          </dd>
          <dt>Public API</dt><dd>{ent.public_api ? <Badge tone="success">enabled</Badge> : <Badge>unavailable</Badge>}</dd>
          <dt>Webhooks</dt><dd>{ent.webhooks ? <Badge tone="success">enabled</Badge> : <Badge>unavailable</Badge>}</dd>
          <dt>Advanced import</dt><dd>{ent.advanced_import ? <Badge tone="success">enabled</Badge> : <Badge>unavailable</Badge>}</dd>
        </dl>
      </Card>

      <TokensSection enabled={ent.public_api} />
      <WebhooksSection enabled={ent.webhooks} />
      <PushSection />
    </div>
  );
}

/** Shown in place of management UI when a feature is gated off. */
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
