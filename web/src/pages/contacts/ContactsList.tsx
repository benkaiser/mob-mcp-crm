import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation, useSearch } from 'wouter-preact';
import { apiGet } from '../../api/client';
import type { Contact, PageMeta, Tag } from '../../api/types';
import { Card, Input, Select, Button, Spinner, EmptyState, ErrorBanner, Badge, Avatar } from '../../ui';
import { contactName, errorMessage } from '../../lib/format';

export function ContactsList() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const initial = new URLSearchParams(search);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState(initial.get('search') ?? '');
  const [status, setStatus] = useState(initial.get('status') ?? '');
  const [favorite, setFavorite] = useState(initial.get('is_favorite') === 'true');
  const [tagName, setTagName] = useState(initial.get('tag_name') ?? '');
  const [sortBy, setSortBy] = useState(initial.get('sort_by') ?? 'name');
  const [sortOrder, setSortOrder] = useState(initial.get('sort_order') ?? 'asc');
  const [page, setPage] = useState(Number(initial.get('page')) || 1);

  useEffect(() => {
    apiGet<Tag[]>('/tags').then(({ data }) => setTags(data)).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ per_page: '25', page: String(page), sort_by: sortBy, sort_order: sortOrder });
      if (searchTerm) qs.set('search', searchTerm);
      if (status) qs.set('status', status);
      if (favorite) qs.set('is_favorite', 'true');
      if (tagName) qs.set('tag_name', tagName);
      const { data, meta } = await apiGet<Contact[]>(`/contacts?${qs.toString()}`);
      setContacts(data);
      setMeta(meta ?? null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load contacts'));
    } finally {
      setLoading(false);
    }
  }

  // Debounce search term; immediate on other filter changes.
  useEffect(() => {
    const handle = setTimeout(load, 250);
    return () => clearTimeout(handle);
  }, [searchTerm, status, favorite, tagName, sortBy, sortOrder, page]);

  // Reset to page 1 when filters change.
  function onFilterChange(fn: () => void) {
    setPage(1);
    fn();
  }

  return (
    <div class="stack">
      <div class="page-header">
        <h1>Contacts {meta && <span class="muted">({meta.total})</span>}</h1>
        <Button onClick={() => navigate('/contacts/new')} data-testid="contacts-new">+ New contact</Button>
      </div>

      <Card>
        <div class="filter-bar">
          <div class="field" style="flex:1;min-width:200px;">
            <Input type="search" placeholder="Search contacts…" value={searchTerm} data-testid="contacts-search"
              onInput={(e) => onFilterChange(() => setSearchTerm((e.target as HTMLInputElement).value))} />
          </div>
          <div class="field">
            <label class="field__label">Status</label>
            <Select value={status} data-testid="contacts-filter-status" onChange={(e) => onFilterChange(() => setStatus((e.target as HTMLSelectElement).value))}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="deceased">Deceased</option>
            </Select>
          </div>
          <div class="field">
            <label class="field__label">Tag</label>
            <Select value={tagName} onChange={(e) => onFilterChange(() => setTagName((e.target as HTMLSelectElement).value))}>
              <option value="">All</option>
              {tags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
            </Select>
          </div>
          <div class="field">
            <label class="field__label">Sort by</label>
            <Select value={sortBy} data-testid="contacts-sort-by" onChange={(e) => onFilterChange(() => setSortBy((e.target as HTMLSelectElement).value))}>
              <option value="name">Name</option>
              <option value="created_at">Created</option>
              <option value="updated_at">Updated</option>
            </Select>
          </div>
          <div class="field">
            <label class="field__label">Order</label>
            <Select value={sortOrder} data-testid="contacts-sort-order" onChange={(e) => onFilterChange(() => setSortOrder((e.target as HTMLSelectElement).value))}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </Select>
          </div>
          <div class="field">
            <label class="checkbox-row">
              <input type="checkbox" checked={favorite} data-testid="contacts-filter-favorite"
                onChange={(e) => onFilterChange(() => setFavorite((e.target as HTMLInputElement).checked))} />
              <span>Favorites only</span>
            </label>
          </div>
        </div>
      </Card>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Spinner size="lg" center />
      ) : contacts.length === 0 ? (
        <EmptyState title="No contacts found" description="Try a different search or add a new contact.">
          <Button onClick={() => navigate('/contacts/new')}>+ New contact</Button>
        </EmptyState>
      ) : (
        <div class="list" data-testid="contacts-list">
          {contacts.map((c) => (
            <Link key={c.id} href={`/contacts/${c.id}`} class="list-row" data-testid="contacts-row" data-contact-id={c.id}>
              <span class="row">
                <Avatar name={contactName(c)} url={c.avatar_url} size="sm" />
                <span data-testid="contacts-row-name">
                  {contactName(c)}
                  {c.company && <span class="muted"> · {c.company}</span>}
                </span>
              </span>
              <span class="row">
                {c.is_favorite && <Badge tone="warning">★</Badge>}
                {c.status !== 'active' && <Badge>{c.status}</Badge>}
              </span>
            </Link>
          ))}
        </div>
      )}

      {meta && meta.total_pages > 1 && (
        <div class="pagination" data-testid="contacts-pagination">
          <Button variant="secondary" size="sm" disabled={page <= 1} data-testid="contacts-page-prev" onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </Button>
          <span class="muted" data-testid="contacts-page-info">Page {meta.page} of {meta.total_pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= meta.total_pages} data-testid="contacts-page-next" onClick={() => setPage((p) => p + 1)}>
            Next →
          </Button>
        </div>
      )}
    </div>
  );
}
