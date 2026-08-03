import { useEffect, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { apiGet } from '../api/client';
import type { DashboardData } from '../api/types';
import { Card, Spinner, ErrorBanner, Badge, EmptyState } from '../ui';
import { Icon, type IconName } from '../ui/Icon';
import { user } from '../store/session';
import { errorMessage, formatDate } from '../lib/format';

export function Dashboard() {
  const me = user.value;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<DashboardData>('/dashboard')
      .then(({ data }) => { if (!cancelled) setData(data); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load dashboard')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const showUsage =
    me?.hosted && me.plan === 'free' && me.entitlements.contact_cap != null && me.entitlements.contact_cap > 0;

  return (
    <div class="stack">
      <div class="page-header">
        <h1>Dashboard</h1>
        {showUsage && me && (
          <span class="usage-chip" title="Free plan contact limit">
            {me.usage.contacts} / {me.entitlements.contact_cap} contacts
          </span>
        )}
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Quick-add row: secondary actions so the sidebar's primary
          "+ New contact" CTA stays visually dominant. Renders as anchor
          buttons (Link-as-button) so wouter handles SPA navigation. */}
      <Card class="quick-add-row" data-testid="dashboard-quick-add">
        <span class="quick-add-row__label">Quick add</span>
        <Link href="/notes/new" class="btn btn--secondary btn--sm" data-testid="dashboard-new-note">+ Note</Link>
        <Link href="/activities/new" class="btn btn--secondary btn--sm" data-testid="dashboard-new-activity">+ Activity</Link>
        <Link href="/reminders/new" class="btn btn--secondary btn--sm" data-testid="dashboard-new-reminder">+ Reminder</Link>
        <Link href="/tasks/new" class="btn btn--secondary btn--sm" data-testid="dashboard-new-task">+ Task</Link>
        <Link href="/debts/new" class="btn btn--secondary btn--sm" data-testid="dashboard-new-debt">+ Debt</Link>
        <Link href="/gifts/new" class="btn btn--secondary btn--sm" data-testid="dashboard-new-gift">+ Gift</Link>
      </Card>

      {loading ? (
        <Spinner size="lg" center />
      ) : !data ? (
        <EmptyState title="No dashboard data" />
      ) : (
        <>
          <div class="counts-row">
            <CountTile label="Contacts" icon="users" num={data.counts.contacts} href="/contacts" />
            <CountTile label="Favorites" icon="star" num={data.counts.favorite_contacts} href="/contacts?is_favorite=true" />
            <CountTile label="Activities" icon="activity" num={data.counts.total_activities} href="/activities" />
            <CountTile label="Notes" icon="file-text" num={data.counts.total_notes} href="/notes" />
            <CountTile label="Reminders" icon="bell" num={data.counts.pending_reminders} href="/reminders" />
            <CountTile label="Tasks" icon="list-checks" num={data.counts.pending_tasks} href="/tasks" />
            <CountTile label="Debts" icon="wallet" num={data.counts.active_debts} href="/debts" />
            <CountTile label="Gift ideas" icon="gift" num={data.counts.gift_ideas} href="/gifts" />
          </div>

          <div class="grid-cards">
            <Card>
              <h2><Link href="/reminders">Upcoming reminders</Link></h2>
              {data.upcoming_reminders.length === 0 ? (
                <p class="muted">Nothing due soon.</p>
              ) : (
                <div class="list">
                  {data.upcoming_reminders.map((r) => (
                    <Link key={r.id} href={`/reminders/${r.id}`} class="sub-row">
                      <span>
                        {r.title}
                        <span class="muted"> · {r.contact_name}</span>
                      </span>
                      <span>
                        {r.is_overdue ? <Badge tone="danger">overdue</Badge> : <Badge>{r.days_until}d</Badge>}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2>Upcoming birthdays</h2>
              {data.upcoming_birthdays.length === 0 ? (
                <p class="muted">No birthdays in the next 30 days.</p>
              ) : (
                <div class="list">
                  {data.upcoming_birthdays.map((b) => (
                    <Link key={b.contact_id} href={`/contacts/${b.contact_id}`} class="sub-row">
                      <span>{b.contact_name}</span>
                      <span class="muted">
                        {b.is_today ? <Badge tone="success">today!</Badge> : `${b.days_until}d`}
                        {b.age_turning != null && ` · turning ${b.age_turning}`}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2><Link href="/activities">Recent activities</Link></h2>
              {data.recent_activities.length === 0 ? (
                <p class="muted">No activities logged yet.</p>
              ) : (
                <div class="list">
                  {data.recent_activities.map((a) => (
                    <Link key={a.id} href={`/activities/${a.id}`} class="sub-row">
                      <span>{a.title || a.type}</span>
                      <span class="muted">{formatDate(a.occurred_at)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2><Link href="/tasks">Open tasks</Link></h2>
              {data.open_tasks.length === 0 ? (
                <p class="muted">No open tasks.</p>
              ) : (
                <div class="list">
                  {data.open_tasks.map((t) => (
                    <Link key={t.id} href={`/tasks/${t.id}`} class="sub-row">
                      <span>{t.title}</span>
                      <span class="row">
                        <Badge tone={t.priority === 'high' ? 'danger' : 'default'}>{t.priority}</Badge>
                        {t.due_date && <span class="muted">{formatDate(t.due_date)}</span>}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2><Link href="/debts">Debt summary</Link></h2>
              {data.debt_summary.by_currency.length === 0 ? (
                <p class="muted">No active debts.</p>
              ) : (
                <div class="list">
                  {data.debt_summary.by_currency.map((d) => (
                    <div key={d.currency} class="sub-row">
                      <span>{d.currency}</span>
                      <span class={d.net_balance >= 0 ? '' : 'muted'}>
                        {d.net_balance >= 0
                          ? `They owe you ${d.net_balance.toFixed(2)}`
                          : `You owe ${Math.abs(d.net_balance).toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                  <div class="muted">{data.debt_summary.active_count} active debt(s)</div>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function CountTile({ label, num, href, icon }: { label: string; num: number; href?: string; icon?: IconName }) {
  const slug = label.toLowerCase().replace(/\s+/g, '-');
  const inner = (
    <>
      {icon && <span class="count-tile__icon" aria-hidden="true"><Icon name={icon} size={20} /></span>}
      <div class="count-tile__num" data-testid={`dashboard-count-${slug}-num`}>{num}</div>
      <div class="count-tile__label">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} class="count-tile" data-testid={`dashboard-count-${slug}`}>{inner}</Link>
  ) : (
    <div class="count-tile" data-testid={`dashboard-count-${slug}`}>{inner}</div>
  );
}
