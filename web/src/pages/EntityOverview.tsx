import { useEffect, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { apiGet } from '../api/client';
import type { Activity, Debt, Gift, Note, Reminder, Task, PageMeta } from '../api/types';
import { Badge, Card, EmptyState, ErrorBanner, Icon, Spinner } from '../ui';
import type { IconName } from '../ui';
import { errorMessage, formatDate } from '../lib/format';
import { humanize } from '../lib/humanize';

type OverviewResource = 'activities' | 'notes' | 'reminders' | 'tasks' | 'debts' | 'gifts';
type Row = Activity | Reminder | Task | Debt | Gift | (Note & { contact_name?: string; body_truncated?: boolean });

interface OverviewConfig<T extends Row = Row> {
  resource: OverviewResource;
  label: string;
  pluralLabel: string;
  icon: IconName;
  newLabel: string;
  emptyTitle: string;
  emptyBody: string;
  render: (item: T) => { title: string; meta: string[]; badges?: Array<{ label: string; tone?: 'default' | 'primary' | 'success' | 'warning' | 'danger' }> };
}

const configs: Record<OverviewResource, OverviewConfig> = {
  activities: {
    resource: 'activities', label: 'Activity', pluralLabel: 'Activities', icon: 'activity', newLabel: 'New Activity',
    emptyTitle: 'No activities yet', emptyBody: 'Log an activity to start building your relationship timeline.',
    render: (item) => {
      const a = item as Activity;
      return {
        title: a.title || humanize(a.type),
        meta: [formatDate(a.occurred_at), a.location ?? '', Array.isArray(a.participants) ? `${a.participants.length} participant(s)` : ''].filter(Boolean),
        badges: [{ label: humanize(a.type), tone: 'primary' }],
      };
    },
  },
  notes: {
    resource: 'notes', label: 'Note', pluralLabel: 'Notes', icon: 'file-text', newLabel: 'New Note',
    emptyTitle: 'No notes yet', emptyBody: 'Create a note to remember important details about a contact.',
    render: (item) => {
      const n = item as Note & { contact_name?: string; body_truncated?: boolean };
      return {
        title: n.title || (n.body ?? '').slice(0, 80) || 'Untitled note',
        meta: [n.contact_name ? `About ${n.contact_name}` : '', formatDate(n.updated_at), n.body_truncated ? 'truncated preview' : ''].filter(Boolean),
        badges: n.is_pinned ? [{ label: 'Pinned', tone: 'warning' }] : [],
      };
    },
  },
  reminders: {
    resource: 'reminders', label: 'Reminder', pluralLabel: 'Reminders', icon: 'bell', newLabel: 'New Reminder',
    emptyTitle: 'No reminders yet', emptyBody: 'Create a reminder so important follow-ups do not slip.',
    render: (item) => {
      const r = item as Reminder;
      return {
        title: r.title,
        meta: [formatDate(r.reminder_date), humanize(r.frequency)],
        badges: [{ label: humanize(r.status), tone: r.status === 'active' ? 'success' : 'default' }],
      };
    },
  },
  tasks: {
    resource: 'tasks', label: 'Task', pluralLabel: 'Tasks', icon: 'list-checks', newLabel: 'New Task',
    emptyTitle: 'No tasks yet', emptyBody: 'Create a task for a contact or for yourself.',
    render: (item) => {
      const t = item as Task;
      return {
        title: t.title,
        meta: [t.due_date ? `Due ${formatDate(t.due_date)}` : 'No due date', humanize(t.status)],
        badges: [{ label: `${humanize(t.priority)} priority`, tone: t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'default' }],
      };
    },
  },
  debts: {
    resource: 'debts', label: 'Debt', pluralLabel: 'Debts', icon: 'wallet', newLabel: 'New Debt',
    emptyTitle: 'No debts yet', emptyBody: 'Track money owed to or from contacts.',
    render: (item) => {
      const d = item as Debt;
      return {
        title: d.reason || 'Debt',
        meta: [formatMoney(d.amount, d.currency), d.incurred_at ? formatDate(d.incurred_at) : 'No incurred date'],
        badges: [
          { label: d.direction === 'they_owe_me' ? 'They owe me' : 'I owe them', tone: d.direction === 'they_owe_me' ? 'success' : 'warning' },
          { label: humanize(d.status), tone: d.status === 'active' ? 'primary' : 'default' },
        ],
      };
    },
  },
  gifts: {
    resource: 'gifts', label: 'Gift', pluralLabel: 'Gifts', icon: 'gift', newLabel: 'New Gift',
    emptyTitle: 'No gifts yet', emptyBody: 'Capture gift ideas, purchases, and gifts received.',
    render: (item) => {
      const g = item as Gift;
      return {
        title: g.name,
        meta: [g.occasion ?? '', g.date ? formatDate(g.date) : '', g.estimated_cost != null ? formatMoney(g.estimated_cost, g.currency) : ''].filter(Boolean),
        badges: [
          { label: humanize(g.status), tone: ['given', 'received', 'purchased'].includes(g.status) ? 'success' : 'default' },
          { label: g.direction === 'giving' ? 'Giving' : 'Receiving', tone: 'primary' },
        ],
      };
    },
  },
};

export function EntityOverview({ resource }: { resource: OverviewResource }) {
  const config = configs[resource];
  const [items, setItems] = useState<Row[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<Row[]>(`/${resource}?per_page=50`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.data);
        setMeta(res.meta ?? null);
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, `Failed to load ${config.pluralLabel.toLowerCase()}`)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [resource]);

  return (
    <div class="stack" data-testid={`overview-${resource}`}>
      <div class="page-header">
        <h1><span class="page-header__icon" aria-hidden="true"><Icon name={config.icon} size={24} /></span> {config.pluralLabel}</h1>
        <Link href={`/${resource}/new`} class="btn" data-testid={`overview-new-${resource}`}>{config.newLabel}</Link>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Spinner size="lg" center />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState title={config.emptyTitle}>{config.emptyBody}</EmptyState>
        </Card>
      ) : (
        <Card class="stack">
          <div class="list" data-testid={`overview-list-${resource}`}>
            {items.map((item) => {
              const rendered = config.render(item);
              return (
                <Link key={item.id} href={`/${resource}/${item.id}`} class="list-row" data-testid="overview-row">
                  <span>
                    <strong>{rendered.title}</strong>
                    {rendered.meta.length > 0 && <span class="muted"> · {rendered.meta.join(' · ')}</span>}
                  </span>
                  {rendered.badges && rendered.badges.length > 0 && (
                    <span class="row">
                      {rendered.badges.map((b, index) => <Badge key={index} tone={b.tone}>{b.label}</Badge>)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          {meta && <p class="muted">Showing {items.length} of {meta.total}</p>}
        </Card>
      )}
    </div>
  );
}

function formatMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(num)) return '';
  const code = currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: code }).format(num);
  } catch {
    return `${num.toFixed(2)} ${code}`;
  }
}
