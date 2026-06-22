import { useEffect, useState } from 'preact/hooks';
import { apiGet } from '../api/client';
import type { CrmStatistics } from '../api/types';
import { Card, Button, Spinner, ErrorBanner, Badge, showToast } from '../ui';
import { errorMessage } from '../lib/format';

export function DataExport() {
  const [stats, setStats] = useState<CrmStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiGet<CrmStatistics>('/export/statistics')
      .then(({ data }) => { if (!cancelled) setStats(data); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err, 'Failed to load statistics')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function download() {
    setDownloading(true);
    try {
      // Fetch the full export and trigger a client-side blob download.
      const res = await fetch('/web/api/export', { credentials: 'include' });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const json = await res.text();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `mob-crm-export-${date}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Export downloaded', 'success');
    } catch (err) {
      showToast(errorMessage(err, 'Export failed'), 'error');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div class="stack">
      <div class="page-header"><h1>Data &amp; export</h1></div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card class="section">
        <div class="section__head"><h2>Export your data</h2></div>
        <p class="muted">Download a full JSON snapshot of all your CRM data.</p>
        <Button onClick={download} disabled={downloading} data-testid="export-download">
          {downloading ? 'Preparing…' : 'Download JSON export'}
        </Button>
      </Card>

      <Card class="section">
        <div class="section__head"><h2>Statistics</h2></div>
        {loading ? (
          <Spinner center />
        ) : !stats ? (
          <p class="muted">No statistics available.</p>
        ) : (
          <>
            <div class="counts-row">
              <Stat label="Contacts" num={stats.total_contacts} testid="contacts" />
              <Stat label="Active" num={stats.active_contacts} testid="active" />
              <Stat label="Archived" num={stats.archived_contacts} testid="archived" />
              <Stat label="Favorites" num={stats.favorite_contacts} testid="favorites" />
              <Stat label="Activities" num={stats.total_activities} testid="activities" />
              <Stat label="Notes" num={stats.total_notes} testid="notes" />
              <Stat label="Life events" num={stats.total_life_events} testid="life-events" />
              <Stat label="Relationships" num={stats.total_relationships} testid="relationships" />
              <Stat label="Pending reminders" num={stats.pending_reminders} testid="pending-reminders" />
              <Stat label="Pending tasks" num={stats.pending_tasks} testid="pending-tasks" />
              <Stat label="Active debts" num={stats.active_debts} testid="active-debts" />
              <Stat label="Gift ideas" num={stats.gift_ideas} testid="gift-ideas" />
              <Stat label="Tags" num={stats.tags_count} testid="tags" />
            </div>
            {stats.contacts_by_company.length > 0 && (
              <div style="margin-top:1.5rem;">
                <h3>Top companies</h3>
                <div class="list">
                  {stats.contacts_by_company.slice(0, 10).map((c) => (
                    <div key={c.company} class="sub-row">
                      <span>{c.company}</span>
                      <Badge>{c.count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, num, testid }: { label: string; num: number; testid: string }) {
  return (
    <div class="count-tile" data-testid={`stat-${testid}`}>
      <div class="count-tile__num" data-testid={`stat-${testid}-num`}>{num}</div>
      <div class="count-tile__label">{label}</div>
    </div>
  );
}
