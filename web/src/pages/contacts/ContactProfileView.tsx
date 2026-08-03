import type { ComponentChildren } from 'preact';
import { useEffect, useState, useCallback } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { apiGet, apiDelete, apiPatch } from '../../api/client';
import type { ContactProfile, Contact } from '../../api/types';
import {
  Card, Spinner, EmptyState, ErrorBanner, Badge, Button, Avatar, ConfirmDialog, showToast,
} from '../../ui';
import { TagAutocomplete } from '../../components/TagAutocomplete';
import { contactName, errorMessage, formatDate } from '../../lib/format';
import {
  MethodEditor, AddressEditor, CustomFieldEditor, RelationshipEditor,
  FoodPreferencesEditor, TagEditor,
  NoteEditor, ActivityEditor, LifeEventEditor, ReminderEditor, TaskEditor, GiftEditor, DebtEditor,
} from './SubEntityEditors';

type Editor =
  | { kind: 'method'; existing?: ContactProfile['contact_methods'][number] }
  | { kind: 'address'; existing?: ContactProfile['addresses'][number] }
  | { kind: 'custom_field'; existing?: ContactProfile['custom_fields'][number] }
  | { kind: 'relationship'; existing?: ContactProfile['relationships'][number] }
  | { kind: 'food' }
  | { kind: 'tag'; initialName?: string; lockName?: boolean }
  | { kind: 'note'; existing?: ContactProfile['recent_notes'][number] }
  | { kind: 'activity'; existing?: ContactProfile['recent_activities'][number] }
  | { kind: 'life_event'; existing?: ContactProfile['life_events'][number] }
  | { kind: 'reminder'; existing?: ContactProfile['active_reminders'][number] }
  | { kind: 'task'; existing?: ContactProfile['open_tasks'][number] }
  | { kind: 'gift'; existing?: ContactProfile['recent_gifts'][number] }
  | { kind: 'debt'; existing?: ContactProfile['active_debts'][number] }
  | null;

export function ContactProfileView({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<ContactProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [favoriteSaving, setFavoriteSaving] = useState(false);
  const [contactOptions, setContactOptions] = useState<{ id: string; name: string }[]>([]);
  const [deleteSub, setDeleteSub] = useState<{ path: string; label: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiGet<ContactProfile>(`/contacts/${id}`)
      .then(({ data }) => setProfile(data))
      .catch((err) => setError(errorMessage(err, 'Failed to load contact')))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Lazy-load contact options for the relationship picker.
  useEffect(() => {
    apiGet<Contact[]>('/contacts?per_page=100&sort_by=name')
      .then(({ data }) => setContactOptions(data.map((c) => ({ id: c.id, name: contactName(c) }))))
      .catch(() => {});
  }, []);

  function refresh() { setEditor(null); load(); }

  async function doDeleteContact() {
    setDeleting(true);
    try {
      await apiDelete(`/contacts/${id}`);
      showToast('Contact deleted', 'success');
      navigate('/contacts');
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete contact'));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function toggleFavorite() {
    if (!profile || favoriteSaving) return;

    const previous = profile.is_favorite;
    const next = !previous;
    setFavoriteSaving(true);
    setProfile((current) => current ? { ...current, is_favorite: next } : current);

    try {
      await apiPatch<Contact>(`/contacts/${id}`, { is_favorite: next });
      showToast(next ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (err) {
      setProfile((current) => current ? { ...current, is_favorite: previous } : current);
      showToast(errorMessage(err, 'Failed to update favorite'), 'error');
    } finally {
      setFavoriteSaving(false);
    }
  }

  async function doDeleteSub() {
    if (!deleteSub) return;
    try {
      await apiDelete(deleteSub.path);
      showToast('Removed', 'success');
      setDeleteSub(null);
      load();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to remove'), 'error');
      setDeleteSub(null);
    }
  }

  if (loading) return <Spinner size="lg" center />;
  if (error && !profile) return <ErrorBanner message={error} />;
  if (!profile) return <EmptyState title="Contact not found" />;

  const p = profile;
  const name = contactName(p);
  const favoriteLabel = p.is_favorite ? 'Remove from favorites' : 'Add to favorites';

  return (
    <div class="stack">
      <div class="page-header">
        <Link href="/contacts">← Contacts</Link>
        <div class="row">
          <Button variant="secondary" onClick={() => navigate(`/contacts/${id}/edit`)} data-testid="contact-edit">Edit</Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} data-testid="contact-delete">Delete</Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/* Header — gradient banner with identity + at-a-glance facts. */}
      <Card class="profile-hero">
        <Avatar name={name} url={p.avatar_url} size="lg" />
        <div class="profile-hero__body">
          <h1 class="profile-hero__name" data-testid="profile-name">
            {name}
            <Button
              type="button"
              variant="ghost"
              class={`favorite-toggle${p.is_favorite ? ' favorite-toggle--active' : ''}`}
              aria-label={favoriteLabel}
              title={favoriteLabel}
              aria-pressed={p.is_favorite}
              disabled={favoriteSaving}
              onClick={toggleFavorite}
              data-testid="favorite-toggle"
            >
              <span aria-hidden="true">{p.is_favorite ? '★' : '☆'}</span>
            </Button>{' '}
            {p.is_favorite && <Badge tone="warning">★ Favorite</Badge>}{' '}
            {p.status !== 'active' && <Badge>{p.status}</Badge>}
          </h1>
          {p.nickname && <div class="muted">“{p.nickname}”</div>}
          {(p.job_title || p.company) && (
            <div class="profile-hero__work" data-testid="profile-work">{[p.job_title, p.company].filter(Boolean).join(' at ')}</div>
          )}
          <div class="profile-hero__facts">
            {p.pronouns && <Badge>{p.pronouns}</Badge>}
            {p.gender && <Badge>{p.gender}</Badge>}
            {p.birthday_display && <Badge>🎂 {p.birthday_display}</Badge>}
            {typeof p.age === 'number' && <Badge>{p.age_approximate ? '~' : ''}{p.age} years</Badge>}
          </div>
        </div>
      </Card>

      {/* Two-column layout: details (left) + activity (right). Collapses to a
          single column on narrow screens. */}
      <div class="profile-grid">
        <div class="profile-col stack">
          {/* Contact methods */}
          <Section title="Contact methods" empty={p.contact_methods.length === 0}
            onAdd={() => setEditor({ kind: 'method' })}>
            {p.contact_methods.length === 0 ? <Empty /> : p.contact_methods.map((m) => (
              <div key={m.id} class="sub-row">
                <span>
                  <strong>{m.type}</strong>: {m.value}
                  {m.label && <span class="muted"> ({m.label})</span>}
                  {m.is_primary && <Badge tone="primary">primary</Badge>}
                </span>
                <RowActions
                  onEdit={() => setEditor({ kind: 'method', existing: m })}
                  onDelete={() => setDeleteSub({ path: `/contacts/${id}/methods/${m.id}`, label: 'contact method' })}
                />
              </div>
            ))}
          </Section>

          {/* Addresses */}
          <Section title="Addresses" empty={p.addresses.length === 0}
            onAdd={() => setEditor({ kind: 'address' })}>
            {p.addresses.length === 0 ? <Empty /> : p.addresses.map((a) => (
              <div key={a.id} class="sub-row">
                <span>
                  {a.label && <strong>{a.label}: </strong>}
                  {[a.street_line_1, a.street_line_2, a.city, a.state_province, a.postal_code, a.country]
                    .filter(Boolean).join(', ')}
                  {a.is_primary && <Badge tone="primary">primary</Badge>}
                </span>
                <RowActions
                  onEdit={() => setEditor({ kind: 'address', existing: a })}
                  onDelete={() => setDeleteSub({ path: `/contacts/${id}/addresses/${a.id}`, label: 'address' })}
                />
              </div>
            ))}
          </Section>

          {/* Tags — each tag links to its tag page (all contacts with that tag). */}
          <Section title="Tags">
            <div class="stack">
              {p.tags.length === 0 ? <Empty /> : (
                <div class="tag-chips">
                  {p.tags.map((t) => (
                    <span key={t.id} class="tag-chip" data-testid="profile-tag">
                      <Link href={`/tags/${encodeURIComponent(t.name)}`} class="tag-chip__link"
                        data-testid="profile-tag-link">{t.name}</Link>
                      <button class="tag-chip__remove" title="Remove tag" aria-label={`Remove tag ${t.name}`}
                        onClick={() => setDeleteSub({ path: `/contacts/${id}/tags/${t.id}`, label: 'tag' })}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <TagAutocomplete
                contactId={id}
                currentTags={p.tags}
                onAdded={load}
                onCreateNew={(name) => setEditor({ kind: 'tag', initialName: name, lockName: true })}
              />
            </div>
          </Section>

          {/* Food preferences */}
          <Section title="Food preferences" empty={!p.food_preferences}
            action={<Button size="sm" variant="secondary" onClick={() => setEditor({ kind: 'food' })}>Edit</Button>}>
            {!p.food_preferences ? <Empty text="No food preferences recorded." /> : (
              <dl class="kv">
                <FoodRow label="Dietary" values={p.food_preferences.dietary_restrictions} />
                <FoodRow label="Allergies" values={p.food_preferences.allergies} />
                <FoodRow label="Favorites" values={p.food_preferences.favorite_foods} />
                <FoodRow label="Dislikes" values={p.food_preferences.disliked_foods} />
                {p.food_preferences.notes && (<><dt>Notes</dt><dd>{p.food_preferences.notes}</dd></>)}
              </dl>
            )}
          </Section>

          {/* Custom fields */}
          <Section title="Custom fields" empty={p.custom_fields.length === 0}
            onAdd={() => setEditor({ kind: 'custom_field' })}>
            {p.custom_fields.length === 0 ? <Empty /> : p.custom_fields.map((cf) => (
              <div key={cf.id} class="sub-row">
                <span>
                  <strong>{cf.field_name}</strong>: {cf.field_value}
                  {cf.field_group && <span class="muted"> [{cf.field_group}]</span>}
                </span>
                <RowActions
                  onEdit={() => setEditor({ kind: 'custom_field', existing: cf })}
                  onDelete={() => setDeleteSub({ path: `/contacts/${id}/custom-fields/${cf.id}`, label: 'custom field' })}
                />
              </div>
            ))}
          </Section>

          {/* Relationships */}
          <Section title="Relationships" empty={p.relationships.length === 0}
            onAdd={() => setEditor({ kind: 'relationship' })}>
            {p.relationships.length === 0 ? <Empty /> : p.relationships.map((r) => (
              <div key={r.id} class="sub-row">
                <span>
                  <Link href={`/contacts/${r.related_contact_id}`}>{r.related_contact_name ?? 'Contact'}</Link>
                  <span class="muted"> — {r.relationship_type}</span>
                  {r.notes && <span class="muted"> · {r.notes}</span>}
                </span>
                <RowActions
                  onEdit={() => setEditor({ kind: 'relationship', existing: r })}
                  onDelete={() => setDeleteSub({ path: `/contacts/${id}/relationships/${r.id}`, label: 'relationship' })}
                />
              </div>
            ))}
          </Section>
        </div>

        <div class="profile-col stack">
          {/* Recent notes */}
          <Section title="Recent notes" empty={p.recent_notes.length === 0}
            onAdd={() => setEditor({ kind: 'note' })}>
            {p.recent_notes.length === 0 ? <Empty /> : p.recent_notes.map((n) => (
              <div key={n.id} class="sub-row">
                <Link href={`/notes/${n.id}`} class="sub-row__meta">
                  <span>{n.is_pinned && '📌 '}{n.title || n.body.slice(0, 80)}</span>
                  <span class="muted">{formatDate(n.created_at)}</span>
                </Link>
                <RowActions
                  onEdit={() => setEditor({ kind: 'note', existing: n })}
                  onDelete={() => setDeleteSub({ path: `/notes/${n.id}`, label: 'note' })}
                />
              </div>
            ))}
          </Section>

          {/* Recent activities */}
          <Section title="Recent activities" empty={p.recent_activities.length === 0}
            onAdd={() => setEditor({ kind: 'activity' })}>
            {p.recent_activities.length === 0 ? <Empty /> : p.recent_activities.map((a) => (
              <div key={a.id} class="sub-row">
                <Link href={`/activities/${a.id}`} class="sub-row__meta">
                  <span>{a.title || a.type}</span>
                  <span class="muted">{formatDate(a.occurred_at)}</span>
                </Link>
                <RowActions
                  onEdit={() => setEditor({ kind: 'activity', existing: a })}
                  onDelete={() => setDeleteSub({ path: `/activities/${a.id}`, label: 'activity' })}
                />
              </div>
            ))}
          </Section>

          {/* Life events */}
          <Section title="Life events" empty={p.life_events.length === 0}
            onAdd={() => setEditor({ kind: 'life_event' })}>
            {p.life_events.length === 0 ? <Empty /> : p.life_events.map((le) => (
              <div key={le.id} class="sub-row">
                <Link href={`/life-events/${le.id}`} class="sub-row__meta">
                  <span><Badge>{le.event_type}</Badge> {le.title}</span>
                  <span class="muted">{formatDate(le.occurred_at)}</span>
                </Link>
                <RowActions
                  onEdit={() => setEditor({ kind: 'life_event', existing: le })}
                  onDelete={() => setDeleteSub({ path: `/life-events/${le.id}`, label: 'life event' })}
                />
              </div>
            ))}
          </Section>

          {/* Active reminders */}
          <Section title="Active reminders" empty={p.active_reminders.length === 0}
            onAdd={() => setEditor({ kind: 'reminder' })}>
            {p.active_reminders.length === 0 ? <Empty /> : p.active_reminders.map((r) => (
              <div key={r.id} class="sub-row">
                <Link href={`/reminders/${r.id}`} class="sub-row__meta">
                  <span>{r.title}{r.is_auto_generated && <span class="muted"> (auto)</span>}</span>
                  <span class="muted">{formatDate(r.reminder_date)}</span>
                </Link>
                <RowActions
                  onEdit={() => setEditor({ kind: 'reminder', existing: r })}
                  onDelete={() => setDeleteSub({ path: `/reminders/${r.id}`, label: 'reminder' })}
                />
              </div>
            ))}
          </Section>

          {/* Open tasks */}
          <Section title="Open tasks" empty={p.open_tasks.length === 0}
            onAdd={() => setEditor({ kind: 'task' })}>
            {p.open_tasks.length === 0 ? <Empty /> : p.open_tasks.map((t) => (
              <div key={t.id} class="sub-row">
                <Link href={`/tasks/${t.id}`} class="sub-row__meta">
                  <span>{t.title} <Badge tone={t.priority === 'high' ? 'danger' : 'default'}>{t.priority}</Badge></span>
                  <span class="muted">{t.due_date ? formatDate(t.due_date) : ''}</span>
                </Link>
                <RowActions
                  onEdit={() => setEditor({ kind: 'task', existing: t })}
                  onDelete={() => setDeleteSub({ path: `/tasks/${t.id}`, label: 'task' })}
                />
              </div>
            ))}
          </Section>

          {/* Gifts */}
          <Section title="Recent gifts" empty={p.recent_gifts.length === 0}
            onAdd={() => setEditor({ kind: 'gift' })}>
            {p.recent_gifts.length === 0 ? <Empty /> : p.recent_gifts.map((g) => (
              <div key={g.id} class="sub-row">
                <Link href={`/gifts/${g.id}`} class="sub-row__meta">
                  <span>{g.name} <Badge>{g.direction === 'giving' ? 'giving' : g.direction}</Badge> <Badge>{g.status}</Badge></span>
                  <span class="muted">{g.estimated_cost != null ? `${g.estimated_cost} ${g.currency}` : ''}</span>
                </Link>
                <RowActions
                  onEdit={() => setEditor({ kind: 'gift', existing: g })}
                  onDelete={() => setDeleteSub({ path: `/gifts/${g.id}`, label: 'gift' })}
                />
              </div>
            ))}
          </Section>

          {/* Debts */}
          <Section title="Active debts" empty={p.active_debts.length === 0}
            onAdd={() => setEditor({ kind: 'debt' })}>
            {p.active_debts.length === 0 ? <Empty /> : (
              <>
                {p.active_debts.map((d) => (
                  <div key={d.id} class="sub-row">
                    <Link href={`/debts/${d.id}`} class="sub-row__meta">
                      <span>{d.reason || 'Debt'} <Badge>{d.direction === 'i_owe_them' ? 'I owe' : 'they owe'}</Badge></span>
                      <span class="muted">{d.amount} {d.currency}</span>
                    </Link>
                    <RowActions
                      onEdit={() => setEditor({ kind: 'debt', existing: d })}
                      onDelete={() => setDeleteSub({ path: `/debts/${d.id}`, label: 'debt' })}
                    />
                  </div>
                ))}
                {p.debt_summary.map((s) => (
                  <div key={s.currency} class="sub-row">
                    <strong>Net ({s.currency})</strong>
                    <span>{s.net_balance >= 0 ? `They owe you ${s.net_balance}` : `You owe ${Math.abs(s.net_balance)}`}</span>
                  </div>
                ))}
              </>
            )}
          </Section>
        </div>
      </div>

      {/* Editors */}
      {editor?.kind === 'method' && (
        <MethodEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'address' && (
        <AddressEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'custom_field' && (
        <CustomFieldEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'relationship' && (
        <RelationshipEditor contactId={id} existing={editor.existing} contactOptions={contactOptions}
          onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'food' && (
        <FoodPreferencesEditor contactId={id} existing={p.food_preferences} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'tag' && (
        <TagEditor contactId={id} initialName={editor.initialName} lockName={editor.lockName}
          onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'note' && (
        <NoteEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'activity' && (
        <ActivityEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'life_event' && (
        <LifeEventEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'reminder' && (
        <ReminderEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'task' && (
        <TaskEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'gift' && (
        <GiftEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}
      {editor?.kind === 'debt' && (
        <DebtEditor contactId={id} existing={editor.existing} onClose={() => setEditor(null)} onSaved={refresh} />
      )}

      <ConfirmDialog open={confirmDelete} title="Delete contact" danger busy={deleting}
        message={<>Delete <strong>{name}</strong>? This soft-deletes the contact and can be restored later.</>}
        confirmLabel="Delete" onCancel={() => setConfirmDelete(false)} onConfirm={doDeleteContact} />

      <ConfirmDialog open={deleteSub != null} title="Remove" danger
        message={`Remove this ${deleteSub?.label ?? 'item'}?`}
        confirmLabel="Remove" onCancel={() => setDeleteSub(null)} onConfirm={doDeleteSub} />
    </div>
  );
}

function Section({ title, children, onAdd, action, empty }: {
  title: string; children: ComponentChildren; onAdd?: () => void;
  action?: ComponentChildren; empty?: boolean;
}) {
  return (
    <Card class={`section${empty ? ' section--empty' : ''}`}>
      <div class="section__head">
        <h2>{title}</h2>
        {action ?? (onAdd && <Button size="sm" variant="secondary" onClick={onAdd}>+ Add</Button>)}
      </div>
      <div class="list">{children}</div>
    </Card>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <span class="sub-row__actions">
      <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
      <Button size="sm" variant="ghost" onClick={onDelete}>Delete</Button>
    </span>
  );
}

function Empty({ text = 'Nothing here yet.' }: { text?: string }) {
  return <p class="muted" style="margin:0;">{text}</p>;
}

function FoodRow({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;
  return (<><dt>{label}</dt><dd>{values.join(', ')}</dd></>);
}
