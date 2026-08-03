import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation, useSearch } from 'wouter-preact';
import { apiGet } from '../api/client';
import type { GlobalSearchResult, SearchEntityType, SearchResult } from '../api/types';
import { Card, Input, Spinner, EmptyState, ErrorBanner, Badge } from '../ui';
import { errorMessage } from '../lib/format';

// Map entity types to deep-link routes (only those with detail pages).
const ROUTE_FOR: Partial<Record<SearchEntityType, (r: SearchResult) => string>> = {
  contacts: (r) => `/contacts/${r.id}`,
  notes: (r) => `/notes/${r.id}`,
  activities: (r) => `/activities/${r.id}`,
  life_events: (r) => `/life-events/${r.id}`,
  gifts: (r) => `/gifts/${r.id}`,
  tasks: (r) => `/tasks/${r.id}`,
  reminders: (r) => `/reminders/${r.id}`,
  debts: (r) => `/debts/${r.id}`,
  relationships: (r) => (r.contact_id ? `/contacts/${r.contact_id}` : '#'),
  contact_methods: (r) => (r.contact_id ? `/contacts/${r.contact_id}` : '#'),
  addresses: (r) => (r.contact_id ? `/contacts/${r.contact_id}` : '#'),
  custom_fields: (r) => (r.contact_id ? `/contacts/${r.contact_id}` : '#'),
};

const LABELS: Record<SearchEntityType, string> = {
  contacts: 'Contacts', notes: 'Notes', activities: 'Activities', life_events: 'Life events',
  gifts: 'Gifts', tasks: 'Tasks', reminders: 'Reminders', debts: 'Debts',
  relationships: 'Relationships', contact_methods: 'Contact methods', addresses: 'Addresses',
  custom_fields: 'Custom fields',
};

export function SearchPage() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const initialQuery = new URLSearchParams(searchString).get('q') ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep input in sync if the URL query changes (e.g. from the shell search box).
  useEffect(() => { setQuery(initialQuery); }, [initialQuery]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResult(null); return; }
    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      apiGet<GlobalSearchResult>(`/search?q=${encodeURIComponent(q)}&limit=10`)
        .then(({ data }) => setResult(data))
        .catch((err) => setError(errorMessage(err, 'Search failed')))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  function onInput(v: string) {
    setQuery(v);
    const next = v.trim() ? `/search?q=${encodeURIComponent(v.trim())}` : '/search';
    navigate(next, { replace: true });
  }

  const groups = result
    ? (Object.keys(result.results) as SearchEntityType[])
        .filter((t) => result.results[t]?.length > 0)
    : [];

  return (
    <div class="stack">
      <div class="page-header"><h1>Search</h1></div>

      <Input type="search" placeholder="Search everything…" value={query} autoFocus
        data-testid="search-input"
        onInput={(e) => onInput((e.target as HTMLInputElement).value)} />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Spinner size="lg" center />
      ) : !query.trim() ? (
        <EmptyState title="Search your CRM" description="Find contacts, notes, activities, tasks and more." />
      ) : result && result.total_matches === 0 ? (
        <EmptyState title="No matches" description={`Nothing found for “${query}”.`} />
      ) : (
        result && (
          <>
            <p class="muted">{result.total_matches} match(es)</p>
            {groups.map((type) => (
              <Card key={type} class="section" data-testid="search-result-group" data-entity-type={type}>
                <div class="section__head"><h2>{LABELS[type]}</h2><Badge>{result.results[type].length}</Badge></div>
                <div class="list" data-testid="search-results">
                  {result.results[type].map((r) => {
                    const href = ROUTE_FOR[type]?.(r) ?? '#';
                    return (
                      <Link key={`${type}-${r.id}`} href={href} class="sub-row"
                        data-testid="search-result-row" data-entity-type={type}>
                        <span>
                          <strong>{r.title}</strong>
                          {r.snippet && <span class="muted"> - {r.snippet}</span>}
                          {r.contact_name && <span class="muted"> · {r.contact_name}</span>}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </Card>
            ))}
          </>
        )
      )}
    </div>
  );
}
