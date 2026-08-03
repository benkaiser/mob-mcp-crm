import { useEffect, useMemo, useState } from 'preact/hooks';
import { apiGet } from '../api/client';
import type { Contact } from '../api/types';
import { Input, Spinner, Badge } from '../ui';
import { contactName } from '../lib/format';

/**
 * Focused contact-selection control for the dedicated /new pages.
 *
 * - `mode: 'single'`: radio-style - picking a contact replaces the selection.
 * - `mode: 'multi'`:  checkbox-style - accumulates selections, with chips for
 *   easy removal.
 *
 * Search filters the in-memory list (we fetch up to 200 contacts sorted by
 * name). For a personal CRM scale that's plenty and keeps the UX snappy
 * without server round-trips on every keystroke. If the population grows
 * beyond this, swap to debounced server-side `?q=` filtering.
 */
interface BasePickerProps {
  /** Optional preselection (e.g. from ?contact_id= URL query). */
  initialIds?: string[];
  /** Hint label shown above the search box. */
  label?: string;
  /** Contact IDs to hide from the selectable list. */
  excludeIds?: string[];
}

interface SinglePickerProps extends BasePickerProps {
  mode: 'single';
  value: string | null;
  onChange: (id: string | null) => void;
}

interface MultiPickerProps extends BasePickerProps {
  mode: 'multi';
  value: string[];
  onChange: (ids: string[]) => void;
}

type PickerProps = SinglePickerProps | MultiPickerProps;

export function ContactPicker(props: PickerProps) {
  const [all, setAll] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<Contact[]>('/contacts?per_page=200&sort_by=name')
      .then(({ data }) => { if (!cancelled) setAll(data); })
      .catch(() => { if (!cancelled) setError('Failed to load contacts'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Contact>();
    all.forEach((c) => m.set(c.id, c));
    return m;
  }, [all]);

  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    const excluded = new Set(props.excludeIds ?? []);
    const available = all.filter((c) => !excluded.has(c.id));
    if (!term) return available;
    return available.filter((c) => contactName(c).toLowerCase().includes(term));
  }, [all, props.excludeIds, term]);

  const selectedIds: string[] = props.mode === 'single'
    ? (props.value ? [props.value] : [])
    : props.value;

  function toggle(id: string) {
    if (props.mode === 'single') {
      props.onChange(props.value === id ? null : id);
    } else {
      const next = props.value.includes(id)
        ? props.value.filter((x) => x !== id)
        : [...props.value, id];
      props.onChange(next);
    }
  }

  function remove(id: string) {
    if (props.mode === 'single') {
      props.onChange(null);
    } else {
      props.onChange(props.value.filter((x) => x !== id));
    }
  }

  return (
    <div class="contact-picker stack">
      {props.label && <div class="field__label">{props.label}</div>}

      {/* Selected chips - always visible so users can see what they've picked. */}
      {selectedIds.length > 0 && (
        <div class="tag-chips" data-testid="contact-picker-chips">
          {selectedIds.map((id) => {
            const c = byId.get(id);
            return (
              <span key={id} class="tag-chip">
                <span class="tag-chip__link">{c ? contactName(c) : id}</span>
                <button type="button" class="tag-chip__remove" aria-label="Remove"
                  onClick={() => remove(id)} data-testid="contact-picker-remove">×</button>
              </span>
            );
          })}
        </div>
      )}

      <Input
        type="search"
        placeholder="Search contacts…"
        value={q}
        autocomplete="off"
        data-testid="contact-picker-search"
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <p class="muted">{error}</p>
      ) : (
        <div class="contact-picker__list" role={props.mode === 'multi' ? 'group' : 'radiogroup'}
          data-testid="contact-picker-list">
          {filtered.length === 0 ? (
            <p class="muted">No contacts match “{q}”.</p>
          ) : filtered.slice(0, 100).map((c) => {
            const checked = selectedIds.includes(c.id);
            return (
              <label key={c.id} class={`contact-picker__row${checked ? ' contact-picker__row--checked' : ''}`}
                data-testid="contact-picker-row">
                <input
                  type={props.mode === 'multi' ? 'checkbox' : 'radio'}
                  name="contact-picker"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                  data-testid={`contact-picker-input-${c.id}`}
                />
                <span class="contact-picker__name">{contactName(c)}</span>
                {c.is_favorite && <Badge tone="warning">★</Badge>}
                {c.company && <span class="muted contact-picker__sub">{c.company}</span>}
              </label>
            );
          })}
          {filtered.length > 100 && (
            <p class="muted contact-picker__hint">Showing first 100 of {filtered.length} matches - refine your search.</p>
          )}
        </div>
      )}
    </div>
  );
}
