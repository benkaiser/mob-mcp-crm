import { useEffect, useState } from 'preact/hooks';
import { Link } from 'wouter-preact';
import { apiGet, apiPost } from '../../api/client';
import type { DuplicatePair } from '../../api/types';
import { Card, Spinner, EmptyState, ErrorBanner, Button, Badge, ConfirmDialog, showToast } from '../../ui';
import { errorMessage } from '../../lib/format';

export function ContactDuplicates() {
  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [merge, setMerge] = useState<{ pair: DuplicatePair; primaryFirst: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    apiGet<DuplicatePair[]>('/contacts/duplicates')
      .then(({ data }) => setPairs(data))
      .catch((err) => setError(errorMessage(err, 'Failed to load duplicates')))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function doMerge() {
    if (!merge) return;
    const { pair, primaryFirst } = merge;
    const primaryId = primaryFirst ? pair.contact_id_1 : pair.contact_id_2;
    const secondaryId = primaryFirst ? pair.contact_id_2 : pair.contact_id_1;
    setBusy(true);
    try {
      await apiPost(`/contacts/${primaryId}/merge`, { secondary_id: secondaryId });
      showToast('Contacts merged', 'success');
      setMerge(null);
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Merge failed'), 'error');
      setMerge(null);
    } finally {
      setBusy(false);
    }
  }

  const m = merge;
  const survivorName = m
    ? (m.primaryFirst ? m.pair.contact_name_1 : m.pair.contact_name_2)
    : '';
  const mergedName = m
    ? (m.primaryFirst ? m.pair.contact_name_2 : m.pair.contact_name_1)
    : '';

  return (
    <div class="stack">
      <div class="page-header">
        <h1>Potential duplicates {pairs.length > 0 && <span class="muted">({pairs.length})</span>}</h1>
        <Link href="/contacts">← Contacts</Link>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Spinner size="lg" center />
      ) : pairs.length === 0 ? (
        <EmptyState title="No duplicates found" description="Your contacts look unique." />
      ) : (
        pairs.map((pair, i) => (
          <Card key={`${pair.contact_id_1}:${pair.contact_id_2}:${i}`}
            data-testid="duplicate-pair"
            data-pair-key={`${pair.contact_id_1}:${pair.contact_id_2}`}>
            <div class="row" style="justify-content:space-between;">
              <div>
                <span data-testid="duplicate-pair-reason">
                  <Badge tone="warning">{pair.reason}</Badge>
                </span>
                <div class="row" style="margin-top:0.5rem;">
                  <Link href={`/contacts/${pair.contact_id_1}`} data-testid="duplicate-pair-name-1">{pair.contact_name_1}</Link>
                  <span class="muted">↔</span>
                  <Link href={`/contacts/${pair.contact_id_2}`} data-testid="duplicate-pair-name-2">{pair.contact_name_2}</Link>
                </div>
              </div>
              <div class="row">
                <Button size="sm" variant="secondary" data-testid="duplicate-pair-keep-1"
                  onClick={() => setMerge({ pair, primaryFirst: true })}>
                  Keep {pair.contact_name_1}
                </Button>
                <Button size="sm" variant="secondary" data-testid="duplicate-pair-keep-2"
                  onClick={() => setMerge({ pair, primaryFirst: false })}>
                  Keep {pair.contact_name_2}
                </Button>
              </div>
            </div>
          </Card>
        ))
      )}

      <ConfirmDialog open={merge != null} title="Merge contacts" busy={busy}
        message={
          <>Merge <strong>{mergedName}</strong> into <strong>{survivorName}</strong>?{' '}
          <strong>{survivorName}</strong> survives; all data from <strong>{mergedName}</strong> moves over and it is removed.</>
        }
        confirmLabel="Merge" onCancel={() => setMerge(null)} onConfirm={doMerge} />
    </div>
  );
}
