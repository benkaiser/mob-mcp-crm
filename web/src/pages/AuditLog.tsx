import { useEffect, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { listAuditLog } from '../api/audit-log';
import type { AuditLogEntry, PageMeta } from '../api/types';
import { Badge, Button, Card, EmptyState, ErrorBanner, Spinner } from '../ui';
import { errorMessage, formatDate } from '../lib/format';

const PER_PAGE = 25;

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [meta, setMeta] = useState<PageMeta | undefined>();
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAuditLog(page, PER_PAGE)
      .then(({ data, meta }) => {
        if (!cancelled) {
          setEntries(data);
          setMeta(meta);
        }
      })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load activity log')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  return (
    <div class="stack" data-testid="activity-log-page">
      <div class="page-header">
        <h1>Activity log</h1>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card>
        {loading ? (
          <Spinner center />
        ) : entries.length === 0 ? (
          <EmptyState title="No activity yet" description="Create or update something in Mob and it will appear here." />
        ) : (
          <>
            <div class="audit-log-list" data-testid="activity-log-list">
              {entries.map((entry) => (
                <div key={entry.id} class="audit-log-row" data-testid="activity-log-row">
                  <div class="audit-log-row__time">{formatDate(entry.created_at)}</div>
                  <div class="audit-log-row__body">
                    <div class="row">
                      <Badge tone={toneFor(entry.action)}>{entry.action}</Badge>
                      <strong>{labelFor(entry.entity_type)}</strong>
                      <EntityLink entry={entry} />
                    </div>
                    <ChangeSummary entry={entry} />
                  </div>
                </div>
              ))}
            </div>

            {meta && meta.total_pages > 1 && (
              <div class="pagination" data-testid="activity-log-pagination">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <span class="muted">Page {meta.page} of {meta.total_pages}</span>
                <Button variant="secondary" size="sm" disabled={page >= meta.total_pages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function EntityLink({ entry }: { entry: AuditLogEntry }) {
  const href = hrefFor(entry);
  const text = entry.entity_id;
  return href ? (
    <Link href={href} class="mono" data-testid="activity-log-entity-link">{text}</Link>
  ) : (
    <span class="mono muted">{text}</span>
  );
}

function ChangeSummary({ entry }: { entry: AuditLogEntry }) {
  const summary = summaryFor(entry);
  return summary ? <div class="muted audit-log-row__summary">{summary}</div> : null;
}

function summaryFor(entry: AuditLogEntry): string | null {
  if (entry.action === 'create') return readableName(entry.new_values);
  if (entry.action === 'delete') return readableName(entry.old_values);
  const oldValues = entry.old_values ?? {};
  const newValues = entry.new_values ?? {};
  const changed = Object.keys(newValues).filter((key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key]));
  return changed.length > 0 ? `Changed ${changed.slice(0, 5).join(', ')}${changed.length > 5 ? '…' : ''}` : null;
}

function readableName(values: Record<string, unknown> | null): string | null {
  if (!values) return null;
  if (typeof values.first_name === 'string') return [values.first_name, values.last_name].filter(Boolean).join(' ');
  for (const key of ['title', 'name', 'field_name', 'value', 'relationship_type']) {
    if (typeof values[key] === 'string' && values[key]) return String(values[key]);
  }
  return null;
}

function hrefFor(entry: AuditLogEntry): string | null {
  if (entry.action === 'delete') return null;
  switch (entry.entity_type) {
    case 'contact': return `/contacts/${entry.entity_id}`;
    case 'note': return `/notes/${entry.entity_id}`;
    case 'activity': return `/activities/${entry.entity_id}`;
    case 'life_event': return `/life-events/${entry.entity_id}`;
    case 'reminder': return `/reminders/${entry.entity_id}`;
    case 'task': return `/tasks/${entry.entity_id}`;
    case 'gift': return `/gifts/${entry.entity_id}`;
    case 'debt': return `/debts/${entry.entity_id}`;
    default: return null;
  }
}

function toneFor(action: AuditLogEntry['action']): 'primary' | 'default' | 'danger' {
  if (action === 'create') return 'primary';
  if (action === 'delete') return 'danger';
  return 'default';
}

function labelFor(entityType: string): string {
  return entityType.replace(/_/g, ' ');
}
