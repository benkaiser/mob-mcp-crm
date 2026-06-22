import { useEffect, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { apiGet } from '../../api/client';
import type { Contact, PageMeta } from '../../api/types';
import { Spinner, EmptyState, ErrorBanner, Badge, Avatar, Button } from '../../ui';
import { contactName, errorMessage } from '../../lib/format';

/**
 * Tag page (bean mob-crm-phm5): lists every contact carrying a given tag.
 * Reached by clicking a tag chip on a contact profile (`/tags/:name`).
 */
export function TagPage({ name }: { name: string }) {
  const [, navigate] = useLocation();
  const tagName = decodeURIComponent(name);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ per_page: '100', sort_by: 'name', tag_name: tagName });
    apiGet<Contact[]>(`/contacts?${qs.toString()}`)
      .then(({ data, meta }) => { setContacts(data); setMeta(meta ?? null); })
      .catch((err) => setError(errorMessage(err, 'Failed to load contacts')))
      .finally(() => setLoading(false));
  }, [tagName]);

  return (
    <div class="stack">
      <div class="page-header">
        <Link href="/contacts">← Contacts</Link>
      </div>

      <h1 class="row" style="gap:var(--space-2);">
        <span class="muted">Tag</span>
        <Badge tone="primary">{tagName}</Badge>
        {meta && <span class="muted">({meta.total})</span>}
      </h1>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {loading ? (
        <Spinner size="lg" center />
      ) : contacts.length === 0 ? (
        <EmptyState title="No contacts with this tag" description="Tag some contacts to see them here.">
          <Button onClick={() => navigate('/contacts')}>Browse contacts</Button>
        </EmptyState>
      ) : (
        <div class="list" data-testid="tag-contacts-list">
          {contacts.map((c) => (
            <Link key={c.id} href={`/contacts/${c.id}`} class="list-row" data-testid="tag-contacts-row" data-contact-id={c.id}>
              <span class="row">
                <Avatar name={contactName(c)} url={c.avatar_url} size="sm" />
                <span>
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
    </div>
  );
}
