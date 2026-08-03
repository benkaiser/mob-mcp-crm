import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
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
  Icon,
} from '../ui';
import type { IconName } from '../ui';
import { humanize } from '../lib/humanize';

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

/** Resources that have a bespoke rich read layout (vs. the raw field dump). */
const RICH_RESOURCES = new Set([
  'activities',
  'notes',
  'life-events',
  'reminders',
  'gifts',
  'debts',
  'tasks',
]);

type Record_ = Record<string, unknown>;

/** Internal/redundant fields that add noise to the detail view. */
const HIDDEN_FIELDS = new Set(['id', 'user_id', 'contact_id', 'deleted_at']);

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

/** Human-friendly relative time (e.g. "3 days ago", "in 2 weeks") for a date. */
function relativeTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const d = new Date(value.length <= 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - Date.now();
  const past = diffMs < 0;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  if (mins < 1) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'],
    [60, 'hour'],
    [24, 'day'],
    [7, 'week'],
    [4.348, 'month'],
    [12, 'year'],
  ];
  let val = mins;
  let unit = 'minute';
  for (const [size, name] of units) {
    if (val < size) { unit = name; break; }
    val = val / size;
    unit = name;
  }
  const rounded = Math.max(1, Math.round(val));
  const label = `${rounded} ${unit}${rounded === 1 ? '' : 's'}`;
  return past ? `${label} ago` : `in ${label}`;
}

/** Format a currency amount (falls back to a plain number when currency is odd). */
function formatMoney(amount: unknown, currency: unknown): string {
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(num)) return '—';
  const code = typeof currency === 'string' && currency ? currency : 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(num);
  } catch {
    return `${num.toFixed(2)} ${code}`;
  }
}

/** Format a duration in minutes as a friendly string ("1h 30m"). */
function formatDuration(minutes: unknown): string {
  const num = typeof minutes === 'number' ? minutes : Number(minutes);
  if (!Number.isFinite(num) || num <= 0) return '—';
  const h = Math.floor(num / 60);
  const m = Math.round(num % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** A friendly countdown label + tone for any due/target date. */
function dateCountdown(dateStr: string): { label: string; sub: string; tone: Tone } {
  const d = daysUntil(dateStr);
  if (d < 0) {
    const n = Math.abs(d);
    return { label: n === 1 ? 'Overdue by 1 day' : `Overdue by ${n} days`, sub: 'This one is past due', tone: 'danger' };
  }
  if (d === 0) return { label: 'Due today', sub: "Don't let this one slip", tone: 'success' };
  if (d === 1) return { label: 'Due tomorrow', sub: 'Coming up next', tone: 'warning' };
  return { label: `In ${d} days`, sub: 'On the horizon', tone: d <= 7 ? 'warning' : 'primary' };
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
  // Resolved participant contacts (activities relate to contacts many-to-many).
  const [participants, setParticipants] = useState<{ id: string; name: string }[]>([]);

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
    setParticipants([]);
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
        // Resolve participant contacts (activities) into names for display.
        const participantIds = res.data?.participants;
        if (Array.isArray(participantIds) && participantIds.length > 0) {
          const ids = participantIds.filter((p): p is string => typeof p === 'string' && !!p);
          Promise.all(
            ids.map((pid) =>
              apiGet<Record_>(`/contacts/${pid}`)
                .then((c) => ({
                  id: pid,
                  name:
                    [c.data?.first_name, c.data?.last_name]
                      .filter((v) => typeof v === 'string' && v)
                      .join(' ') || pid,
                }))
                .catch(() => ({ id: pid, name: pid })),
            ),
          ).then((resolved) => {
            if (!cancelled) setParticipants(resolved);
          });
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
          ) : RICH_RESOURCES.has(resource) ? (
            <RichEntityBody resource={resource} data={data} contactName={contactName} participants={participants} />
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
 * Shared rich read layout used by every timeline entity. A resource-specific
 * builder maps the raw record into this common shape: a gradient hero with an
 * icon + title + badges, an optional highlight banner, a stat grid (the first
 * slot reserved for the linked contact), an optional long-form body section,
 * and a subtle metadata footer.
 */
interface StatItem {
  label: string;
  value: ComponentChildren;
  testid?: string;
  href?: string;
  cap?: boolean;
}
interface BadgeItem {
  label: string;
  tone: Tone;
  testid?: string;
}
interface SectionItem {
  label: string;
  value: string;
  testid?: string;
}
interface RichView {
  icon: IconName;
  title: string;
  titleTestid?: string;
  badges: BadgeItem[];
  highlight?: { label: string; sub: string; tone: Tone };
  stats: StatItem[];
  sections: SectionItem[];
}

function RichEntityBody({
  resource,
  data,
  contactName,
  participants = [],
}: {
  resource: string;
  data: Record_;
  contactName: string | null;
  participants?: { id: string; name: string }[];
}) {
  const builder = RICH_BUILDERS[resource];
  const view = builder ? builder(data) : null;
  if (!view) return null;

  const contactId = typeof data.contact_id === 'string' ? data.contact_id : '';

  return (
    <div class="detail" data-testid={`${resource}-detail`}>
      <div class="detail__hero">
        <span class="detail__icon" aria-hidden="true"><Icon name={view.icon} size={26} /></span>
        <div class="detail__heading">
          <h2 class="detail__title" data-testid={view.titleTestid ?? 'entity-field-title'}>{view.title}</h2>
          {view.badges.length > 0 && (
            <div class="detail__badges">
              {view.badges.map((b, i) => (
                <span key={i} data-testid={b.testid}>
                  <Badge tone={b.tone}>{b.label}</Badge>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {view.highlight && (
        <div
          class={`detail__banner detail__banner--${view.highlight.tone}`}
          data-testid="detail-highlight"
        >
          <div class="detail__banner-label">{view.highlight.label}</div>
          <div class="detail__banner-sub">{view.highlight.sub}</div>
        </div>
      )}

      <div class="detail__grid">
        {contactId && (
          <Link
            href={`/contacts/${contactId}`}
            class="detail__stat detail__stat--contact"
            data-testid="entity-field-contact-link"
          >
            <span class="detail__stat-label">Contact</span>
            <span class="detail__contact">
              <Avatar name={contactName ?? '?'} size="sm" />
              <span class="detail__stat-value">{contactName ?? contactId}</span>
            </span>
          </Link>
        )}
        {view.stats.map((s, i) =>
          s.href ? (
            <a
              key={i}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              class="detail__stat detail__stat--contact"
              data-testid={s.testid}
            >
              <span class="detail__stat-label">{s.label}</span>
              <span class={`detail__stat-value${s.cap ? ' detail__stat-value--cap' : ''}`}>{s.value}</span>
            </a>
          ) : (
            <div key={i} class="detail__stat">
              <span class="detail__stat-label">{s.label}</span>
              <span class={`detail__stat-value${s.cap ? ' detail__stat-value--cap' : ''}`} data-testid={s.testid}>
                {s.value}
              </span>
            </div>
          ),
        )}
      </div>

      {participants.length > 0 && (
        <div class="detail__section" data-testid="activity-participants">
          <span class="detail__stat-label">{participants.length === 1 ? 'Person' : 'People'}</span>
          <div class="detail__people">
            {participants.map((p) => (
              <Link
                key={p.id}
                href={`/contacts/${p.id}`}
                class="detail__stat detail__stat--contact"
                data-testid="entity-field-participant-link"
              >
                <span class="detail__contact">
                  <Avatar name={p.name} size="sm" />
                  <span class="detail__stat-value">{p.name}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {view.sections.map((sec, i) => (
        <div key={i} class="detail__section">
          <span class="detail__stat-label">{sec.label}</span>
          {sec.value ? (
            <p class="detail__body" data-testid={sec.testid}>{sec.value}</p>
          ) : (
            <p class="detail__body muted" data-testid={sec.testid}>Nothing added.</p>
          )}
        </div>
      ))}

      <div class="detail__meta">
        <span>Created {formatTimestamp(data.created_at)}</span>
        <span aria-hidden="true">·</span>
        <span>Updated {formatTimestamp(data.updated_at)}</span>
      </div>
    </div>
  );
}

/** Icon per activity type. */
const ACTIVITY_ICONS: Record<string, IconName> = {
  phone_call: 'phone',
  video_call: 'video',
  text_message: 'message-circle',
  in_person: 'users',
  email: 'mail',
  activity: 'sparkles',
  other: 'pin',
};

/** Builders map a raw record into the shared RichView shape, one per resource. */
const RICH_BUILDERS: Record<string, (data: Record_) => RichView> = {
  activities(data) {
    const type = typeof data.type === 'string' ? data.type : 'other';
    const title = (typeof data.title === 'string' && data.title) || humanize(type);
    const occurredAt = typeof data.occurred_at === 'string' ? data.occurred_at : '';
    const duration = data.duration_minutes;
    const location = typeof data.location === 'string' ? data.location : '';
    const rel = relativeTime(occurredAt);
    const badges: BadgeItem[] = [
      { label: humanize(type), tone: 'primary', testid: 'entity-field-type' },
    ];
    if (typeof duration === 'number' && duration > 0) {
      badges.push({ label: formatDuration(duration), tone: 'default' });
    }
    const stats: StatItem[] = [
      { label: 'When', value: formatTimestamp(occurredAt), testid: 'entity-field-occurred_at' },
    ];
    if (typeof duration === 'number' && duration > 0) {
      stats.push({ label: 'Duration', value: formatDuration(duration), testid: 'entity-field-duration_minutes' });
    }
    if (location) stats.push({ label: 'Location', value: location, testid: 'entity-field-location' });
    return {
      icon: ACTIVITY_ICONS[type] ?? 'pin',
      title,
      badges,
      highlight: occurredAt
        ? { label: formatNiceDate(occurredAt), sub: rel ? `Happened ${rel}` : 'Logged interaction', tone: 'primary' }
        : undefined,
      stats,
      sections: [
        { label: 'Description', value: typeof data.description === 'string' ? data.description : '', testid: 'entity-field-description' },
      ],
    };
  },

  notes(data) {
    const pinned = Boolean(data.is_pinned);
    const badges: BadgeItem[] = [];
    if (pinned) badges.push({ label: 'Pinned', tone: 'warning' });
    return {
      icon: pinned ? 'pin' : 'file-text',
      title: (typeof data.title === 'string' && data.title) || 'Note',
      badges,
      stats: [],
      sections: [
        { label: 'Note', value: typeof data.body === 'string' ? data.body : '', testid: 'entity-field-body' },
      ],
    };
  },

  'life-events'(data) {
    const eventType = typeof data.event_type === 'string' ? data.event_type : '';
    const occurredAt = typeof data.occurred_at === 'string' ? data.occurred_at : '';
    const rel = relativeTime(occurredAt);
    return {
      icon: 'star',
      title: (typeof data.title === 'string' && data.title) || 'Life event',
      badges: eventType
        ? [{ label: humanize(eventType), tone: 'primary', testid: 'entity-field-event_type' }]
        : [],
      highlight: occurredAt
        ? { label: formatNiceDate(occurredAt), sub: rel ? `${rel[0].toUpperCase()}${rel.slice(1)}` : 'A moment worth remembering', tone: 'primary' }
        : undefined,
      stats: occurredAt
        ? [{ label: 'When', value: formatNiceDate(occurredAt), testid: 'entity-field-occurred_at' }]
        : [],
      sections: [
        { label: 'Description', value: typeof data.description === 'string' ? data.description : '', testid: 'entity-field-description' },
      ],
    };
  },

  gifts(data) {
    const direction = typeof data.direction === 'string' ? data.direction : '';
    const status = typeof data.status === 'string' ? data.status : '';
    const occasion = typeof data.occasion === 'string' ? data.occasion : '';
    const url = typeof data.url === 'string' ? data.url : '';
    const cost = data.estimated_cost;
    const hasCost = typeof cost === 'number' && Number.isFinite(cost);
    const badges: BadgeItem[] = [];
    if (direction) {
      badges.push({
        label: direction === 'giving' ? 'Giving' : 'Receiving',
        tone: 'primary',
        testid: 'entity-field-direction',
      });
    }
    if (status) badges.push({ label: humanize(status), tone: giftStatusTone(status) });
    const stats: StatItem[] = [];
    if (occasion) stats.push({ label: 'Occasion', value: occasion, testid: 'entity-field-occasion' });
    if (data.date) stats.push({ label: 'Date', value: formatNiceDate(data.date), testid: 'entity-field-date' });
    if (status) stats.push({ label: 'Status', value: humanize(status), testid: 'entity-field-status' });
    if (url) stats.push({ label: 'Link', value: 'Open ↗', href: url, testid: 'entity-field-url' });
    return {
      icon: 'gift',
      title: (typeof data.name === 'string' && data.name) || 'Gift',
      badges,
      highlight: hasCost
        ? {
            label: formatMoney(cost, data.currency),
            sub: direction === 'giving' ? 'Estimated cost to give' : 'Estimated value received',
            tone: 'success',
          }
        : undefined,
      stats,
      sections: [
        { label: 'Description', value: typeof data.description === 'string' ? data.description : '', testid: 'entity-field-description' },
      ],
    };
  },

  debts(data) {
    const direction = typeof data.direction === 'string' ? data.direction : '';
    const status = typeof data.status === 'string' ? data.status : '';
    const owedToMe = direction === 'they_owe_me';
    const settled = status === 'settled';
    const stats: StatItem[] = [];
    if (status) stats.push({ label: 'Status', value: humanize(status), testid: 'entity-field-status', cap: true });
    if (data.incurred_at) stats.push({ label: 'Incurred', value: formatNiceDate(data.incurred_at), testid: 'entity-field-incurred_at' });
    if (data.settled_at) stats.push({ label: 'Settled', value: formatNiceDate(data.settled_at), testid: 'entity-field-settled_at' });
    return {
      icon: 'wallet',
      title: (typeof data.reason === 'string' && data.reason) || 'Debt',
      badges: [
        {
          label: owedToMe ? 'They owe me' : 'I owe them',
          tone: owedToMe ? 'success' : 'warning',
          testid: 'entity-field-direction',
        },
        { label: settled ? 'Settled' : 'Active', tone: settled ? 'default' : 'primary' },
      ],
      highlight: {
        label: formatMoney(data.amount, data.currency),
        sub: settled
          ? 'This debt has been settled'
          : owedToMe
            ? 'Owed to you'
            : 'You owe this amount',
        tone: settled ? 'default' : owedToMe ? 'success' : 'warning',
      },
      stats,
      sections: [],
    };
  },

  tasks(data) {
    const status = typeof data.status === 'string' ? data.status : 'pending';
    const priority = typeof data.priority === 'string' ? data.priority : 'medium';
    const dueDate = typeof data.due_date === 'string' ? data.due_date : '';
    const done = status === 'completed';
    const badges: BadgeItem[] = [
      { label: humanize(status), tone: taskStatusTone(status), testid: 'entity-field-status' },
      { label: `${humanize(priority)} priority`, tone: priorityTone(priority) },
    ];
    const stats: StatItem[] = [];
    if (dueDate) stats.push({ label: 'Due', value: formatNiceDate(dueDate), testid: 'entity-field-due_date' });
    stats.push({ label: 'Priority', value: humanize(priority), testid: 'entity-field-priority' });
    if (data.completed_at) stats.push({ label: 'Completed', value: formatTimestamp(data.completed_at), testid: 'entity-field-completed_at' });
    return {
      icon: done ? 'circle-check-big' : 'list-checks',
      title: (typeof data.title === 'string' && data.title) || 'Task',
      badges,
      highlight: dueDate && !done
        ? (() => { const c = dateCountdown(dueDate); return { label: c.label, sub: `${c.sub} · ${formatNiceDate(dueDate)}`, tone: c.tone }; })()
        : done
          ? { label: 'Completed', sub: 'Nice work — this task is done', tone: 'success' }
          : undefined,
      stats,
      sections: [
        { label: 'Description', value: typeof data.description === 'string' ? data.description : '', testid: 'entity-field-description' },
      ],
    };
  },

  reminders(data) {
    const reminderDate = typeof data.reminder_date === 'string' ? data.reminder_date : '';
    const frequency = typeof data.frequency === 'string' ? data.frequency : 'one_time';
    const status = data.status;
    const isAuto = Boolean(data.is_auto_generated);
    const recurring = frequency !== 'one_time';
    const countdown = reminderDate ? dateCountdown(reminderDate) : undefined;
    const badges: BadgeItem[] = [
      { label: humanize(String(status ?? 'unknown')), tone: statusTone(status), testid: 'entity-field-status' },
      { label: recurring ? `Repeats ${frequency}` : 'One-time', tone: recurring ? 'primary' : 'default' },
    ];
    if (isAuto) badges.push({ label: 'Auto-generated', tone: 'default' });
    return {
      icon: 'bell',
      title: (typeof data.title === 'string' && data.title) || 'Reminder',
      badges,
      highlight: countdown
        ? { label: countdown.label, sub: `${countdown.sub} · ${formatNiceDate(reminderDate)}`, tone: countdown.tone }
        : undefined,
      stats: [
        { label: 'Next on', value: formatNiceDate(reminderDate), testid: 'entity-field-reminder_date' },
        { label: 'Frequency', value: humanize(frequency), testid: 'entity-field-frequency' },
      ],
      sections: [
        { label: 'Description', value: typeof data.description === 'string' ? data.description : '', testid: 'entity-field-description' },
      ],
    };
  },
};

function giftStatusTone(status: string): Tone {
  switch (status) {
    case 'given':
    case 'received':
    case 'purchased':
      return 'success';
    case 'planned':
      return 'primary';
    default:
      return 'default';
  }
}

function taskStatusTone(status: string): Tone {
  switch (status) {
    case 'completed': return 'success';
    case 'in_progress': return 'primary';
    default: return 'default';
  }
}

function priorityTone(priority: string): Tone {
  switch (priority) {
    case 'high': return 'danger';
    case 'medium': return 'warning';
    default: return 'default';
  }
}
