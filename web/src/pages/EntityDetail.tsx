import { useEffect, useState } from 'preact/hooks';
import { useLocation, Link } from 'wouter-preact';
import { apiGet, apiPatch, apiDelete, apiPost, ApiError } from '../api/client';
import {
  Button,
  Card,
  Spinner,
  EmptyState,
  ErrorBanner,
  Input,
  Textarea,
  Field,
  ConfirmDialog,
  showToast,
  Badge,
  Avatar,
} from '../ui';

/**
 * Detail page for a single timeline entity (activity, note, life event,
 * reminder, gift, debt, task). Fetches the record from `/<resource>/:id`,
 * renders its scalar fields, and exposes edit / delete / complete controls.
 *
 * Per-resource config picks the primary editable field and whether a
 * complete lifecycle action is available (reminders + tasks).
 */
interface ResourceConfig {
  /** The primary editable field key on the record. */
  field: string;
  /** Which input control to render when editing. */
  input: 'text' | 'textarea';
  /** Whether POST /<resource>/:id/complete is supported. */
  canComplete?: boolean;
}

const CONFIG: Record<string, ResourceConfig> = {
  activities: { field: 'title', input: 'text' },
  notes: { field: 'body', input: 'textarea' },
  'life-events': { field: 'title', input: 'text' },
  reminders: { field: 'title', input: 'text', canComplete: true },
  gifts: { field: 'name', input: 'text' },
  debts: { field: 'reason', input: 'text' },
  tasks: { field: 'title', input: 'text', canComplete: true },
};

type Record_ = Record<string, unknown>;

/** Internal/redundant fields that add noise to the detail view. */
const HIDDEN_FIELDS = new Set(['id', 'user_id', 'contact_id', 'deleted_at']);

/** Turn a snake_case field key into a human-readable label. */
function humanize(key: string): string {
  const spaced = key.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render a scalar value as a string for display. */
function display(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

/** Format a YYYY-MM-DD (or ISO) string as a friendly date with weekday. */
function formatNiceDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

/** Format an ISO timestamp as a short local date + time. */
function formatTimestamp(value: unknown): string {
  if (typeof value !== 'string' || !value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Whole days from today (local midnight) to the given date string. */
function daysUntil(dateStr: string): number {
  const target = new Date(dateStr.length <= 10 ? dateStr + 'T00:00:00' : dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** A friendly countdown label + tone for a reminder's due date. */
function reminderCountdown(dateStr: string): { label: string; sub: string; tone: Tone } {
  const d = daysUntil(dateStr);
  if (d < 0) {
    const n = Math.abs(d);
    return { label: n === 1 ? 'Overdue by 1 day' : `Overdue by ${n} days`, sub: 'This reminder is past due', tone: 'danger' };
  }
  if (d === 0) return { label: 'Due today', sub: "Don't let this one slip", tone: 'success' };
  if (d === 1) return { label: 'Due tomorrow', sub: 'Coming up next', tone: 'warning' };
  return { label: `In ${d} days`, sub: 'On the horizon', tone: d <= 7 ? 'warning' : 'primary' };
}

/** Tone for a reminder/task status value. */
function statusTone(status: unknown): Tone {
  switch (status) {
    case 'active': return 'success';
    case 'snoozed': return 'warning';
    case 'completed': return 'primary';
    case 'dismissed': return 'default';
    default: return 'default';
  }
}

export function EntityDetail({
  resource,
  label,
  id,
}: {
  resource: string;
  label: string;
  id: string;
}) {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<Record_ | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Linked contact (resolved name for the contact_id field, if present).
  const [contactName, setContactName] = useState<string | null>(null);

  // Edit state.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Complete state.
  const [completing, setCompleting] = useState(false);

  const config = CONFIG[resource] ?? { field: 'id', input: 'text' as const };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditing(false);
    setContactName(null);
    apiGet<Record_>(`/${resource}/${id}`)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        // Resolve the linked contact's name so we can render a friendly link.
        const contactId = res.data?.contact_id;
        if (typeof contactId === 'string' && contactId) {
          apiGet<Record_>(`/contacts/${contactId}`)
            .then((c) => {
              if (cancelled) return;
              const name = [c.data?.first_name, c.data?.last_name]
                .filter((v) => typeof v === 'string' && v)
                .join(' ');
              setContactName(name || null);
            })
            .catch(() => { /* fall back to the id if the contact can't be loaded */ });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : `Failed to load ${label}`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resource, id]);

  function startEdit() {
    const current = data?.[config.field];
    setDraft(current == null ? '' : String(current));
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const res = await apiPatch<Record_>(`/${resource}/${id}`, { [config.field]: draft });
      setData(res.data);
      setEditing(false);
      showToast(`${label} updated`, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Failed to update ${label}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await apiDelete(`/${resource}/${id}`);
      showToast(`${label} deleted`, 'success');
      setConfirmOpen(false);
      setLocation('/');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Failed to delete ${label}`, 'error');
      setDeleting(false);
    }
  }

  async function complete() {
    setCompleting(true);
    try {
      const res = await apiPost<Record_>(`/${resource}/${id}/complete`, {});
      setData(res.data);
      showToast(`${label} completed`, 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Failed to complete ${label}`, 'error');
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div class="stack" data-testid="entity-detail" data-resource={resource}>
      <div class="page-header">
        <h1>
          {label} <span class="muted" data-testid="entity-detail-id">{id}</span>
        </h1>
      </div>
      {loading ? (
        <Spinner size="lg" center />
      ) : error ? (
        <ErrorBanner message={error} />
      ) : data == null ? (
        <EmptyState title={`${label} not found`} />
      ) : (
        <Card>
          {editing ? (
            <div class="stack">
              <Field label={humanize(config.field)}>
                {config.input === 'textarea' ? (
                  <Textarea
                    data-testid="entity-edit-input"
                    value={draft}
                    onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
                  />
                ) : (
                  <Input
                    data-testid="entity-edit-input"
                    value={draft}
                    onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
                  />
                )}
              </Field>
              <div class="row" style="gap:0.5rem;">
                <Button data-testid="entity-edit-save" onClick={saveEdit} disabled={saving}>
                  Save
                </Button>
                <Button
                  variant="secondary"
                  data-testid="entity-edit-cancel"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : resource === 'reminders' ? (
            <ReminderBody data={data} contactName={contactName} />
          ) : (
            <dl class="entity-fields">
              {typeof data.contact_id === 'string' && data.contact_id && (
                <div class="entity-field">
                  <dt class="muted">Contact</dt>
                  <dd>
                    <Link
                      href={`/contacts/${data.contact_id}`}
                      data-testid="entity-field-contact-link"
                    >
                      {contactName ?? String(data.contact_id)}
                    </Link>
                  </dd>
                </div>
              )}
              {Object.entries(data)
                .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && (v == null || typeof v !== 'object'))
                .map(([key, value]) => (
                  <div key={key} class="entity-field">
                    <dt class="muted">{humanize(key)}</dt>
                    <dd data-testid={`entity-field-${key}`}>{display(value)}</dd>
                  </div>
                ))}
            </dl>
          )}

          {!editing && (
            <div class="row" style="gap:0.5rem;margin-top:1rem;">
              <Button data-testid="entity-edit" onClick={startEdit}>
                Edit
              </Button>
              {config.canComplete && (
                <Button
                  variant="secondary"
                  data-testid="entity-complete"
                  onClick={complete}
                  disabled={completing}
                >
                  Complete
                </Button>
              )}
              <Button
                variant="danger"
                data-testid="entity-delete"
                onClick={() => setConfirmOpen(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${label}?`}
        message={`This will permanently remove this ${label.toLowerCase()}.`}
        confirmLabel="Delete"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

/**
 * Rich, reminder-specific read layout: a hero with the title, a status/frequency
 * badge row, a linked contact chip, a prominent due-date countdown, a grid of
 * key facts, an optional description, and a subtle metadata footer.
 */
function ReminderBody({ data, contactName }: { data: Record_; contactName: string | null }) {
  const title = typeof data.title === 'string' ? data.title : 'Reminder';
  const reminderDate = typeof data.reminder_date === 'string' ? data.reminder_date : '';
  const frequency = typeof data.frequency === 'string' ? data.frequency : 'one_time';
  const status = data.status;
  const description = typeof data.description === 'string' ? data.description : '';
  const isAuto = Boolean(data.is_auto_generated);
  const contactId = typeof data.contact_id === 'string' ? data.contact_id : '';
  const countdown = reminderDate ? reminderCountdown(reminderDate) : null;
  const recurring = frequency !== 'one_time';

  return (
    <div class="reminder-detail" data-testid="reminder-detail">
      <div class="reminder-detail__hero">
        <span class="reminder-detail__icon" aria-hidden="true">🔔</span>
        <div class="reminder-detail__heading">
          <h2 class="reminder-detail__title" data-testid="entity-field-title">{title}</h2>
          <div class="reminder-detail__badges">
            <Badge tone={statusTone(status)}>{humanize(String(status ?? 'unknown'))}</Badge>
            <Badge tone={recurring ? 'primary' : 'default'}>
              {recurring ? `Repeats ${frequency}` : 'One-time'}
            </Badge>
            {isAuto && <Badge tone="default">Auto-generated</Badge>}
          </div>
        </div>
      </div>

      {countdown && (
        <div
          class={`reminder-detail__countdown reminder-detail__countdown--${countdown.tone}`}
          data-testid="reminder-countdown"
        >
          <div class="reminder-detail__countdown-label">{countdown.label}</div>
          <div class="reminder-detail__countdown-sub">
            {countdown.sub} · {formatNiceDate(reminderDate)}
          </div>
        </div>
      )}

      <div class="reminder-detail__grid">
        {contactId && (
          <Link
            href={`/contacts/${contactId}`}
            class="reminder-detail__stat reminder-detail__stat--contact"
            data-testid="entity-field-contact-link"
          >
            <span class="reminder-detail__stat-label">Contact</span>
            <span class="reminder-detail__contact">
              <Avatar name={contactName ?? '?'} size="sm" />
              <span class="reminder-detail__stat-value">{contactName ?? contactId}</span>
            </span>
          </Link>
        )}
        <div class="reminder-detail__stat">
          <span class="reminder-detail__stat-label">Next on</span>
          <span class="reminder-detail__stat-value" data-testid="entity-field-reminder_date">
            {formatNiceDate(reminderDate)}
          </span>
        </div>
        <div class="reminder-detail__stat">
          <span class="reminder-detail__stat-label">Frequency</span>
          <span class="reminder-detail__stat-value" data-testid="entity-field-frequency">
            {humanize(frequency)}
          </span>
        </div>
        <div class="reminder-detail__stat">
          <span class="reminder-detail__stat-label">Status</span>
          <span class="reminder-detail__stat-value reminder-detail__stat-value--cap" data-testid="entity-field-status">
            {String(status ?? 'unknown')}
          </span>
        </div>
      </div>

      <div class="reminder-detail__section">
        <span class="reminder-detail__stat-label">Description</span>
        {description ? (
          <p class="reminder-detail__description">{description}</p>
        ) : (
          <p class="reminder-detail__description muted">No description added.</p>
        )}
      </div>

      <div class="reminder-detail__meta">
        <span>Created {formatTimestamp(data.created_at)}</span>
        <span aria-hidden="true">·</span>
        <span>Updated {formatTimestamp(data.updated_at)}</span>
      </div>
    </div>
  );
}

