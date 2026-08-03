import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { apiGet, apiPost } from '../api/client';
import type { Tag } from '../api/types';
import { Input, Button, showToast } from '../ui';
import { errorMessage } from '../lib/format';

interface TagAutocompleteProps {
  contactId: string;
  currentTags: Tag[];
  onAdded: () => void;
}

const MAX_SUGGESTIONS = 8;

function normalise(name: string): string {
  return name.trim().toLowerCase();
}

export function TagAutocomplete({ contactId, currentTags, onAdded }: TagAutocompleteProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const listId = useRef(`tag-autocomplete-${Math.random().toString(36).slice(2)}`);
  const loadingRef = useRef<Promise<Tag[]> | null>(null);

  const currentNames = useMemo(() => new Set(currentTags.map((tag) => normalise(tag.name))), [currentTags]);
  const currentIds = useMemo(() => new Set(currentTags.map((tag) => tag.id)), [currentTags]);

  async function loadTags(): Promise<Tag[]> {
    if (loaded) return allTags;
    if (loadingRef.current) return loadingRef.current;

    setLoading(true);
    const request = apiGet<Tag[]>('/tags')
      .then(({ data }) => {
        setAllTags(data);
        setLoaded(true);
        return data;
      })
      .catch((err) => {
        showToast(errorMessage(err, 'Failed to load tags'), 'error');
        return [] as Tag[];
      })
      .finally(() => {
        setLoading(false);
        loadingRef.current = null;
      });

    loadingRef.current = request;
    return request;
  }

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const availableTags = useMemo(
    () => allTags.filter((tag) => !currentIds.has(tag.id) && !currentNames.has(normalise(tag.name))),
    [allTags, currentIds, currentNames],
  );

  const suggestions = useMemo(() => {
    const term = normalise(query);
    const matches = term
      ? availableTags.filter((tag) => normalise(tag.name).includes(term))
      : availableTags;
    return matches
      .sort((a, b) => {
        const aExact = normalise(a.name) === term;
        const bExact = normalise(b.name) === term;
        if (aExact !== bExact) return aExact ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, MAX_SUGGESTIONS);
  }, [availableTags, query]);

  async function assignExisting(tag: Tag) {
    if (saving) return;
    setSaving(true);
    try {
      await apiPost(`/contacts/${contactId}/tags`, { name: tag.name });
      showToast('Tag added', 'success');
      setQuery('');
      setOpen(false);
      onAdded();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to add tag'), 'error');
    } finally {
      setSaving(false);
    }
  }

  async function confirmTypedName() {
    const name = query.trim();
    if (!name || saving) return;

    const tags = loaded ? allTags : await loadTags();
    const key = normalise(name);
    if (currentNames.has(key)) {
      showToast('Tag already added', 'error');
      setQuery('');
      setOpen(false);
      return;
    }

    const existing = tags.find((tag) => normalise(tag.name) === key);
    if (existing) {
      await assignExisting(existing);
      return;
    }

    setSaving(true);
    try {
      await apiPost(`/contacts/${contactId}/tags`, { name });
      showToast('Tag added', 'success');
      setQuery('');
      setOpen(false);
      onAdded();
    } catch (err) {
      showToast(errorMessage(err, 'Failed to add tag'), 'error');
    } finally {
      setSaving(false);
    }
  }

  function onFocus() {
    setOpen(true);
    void loadTags();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      void loadTags();
      setActiveIndex((i) => Math.min(i + 1, Math.max(suggestions.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const active = query.trim() && open ? suggestions[activeIndex] : undefined;
      if (active) {
        void assignExisting(active);
      } else {
        void confirmTypedName();
      }
    }
  }

  return (
    <form class="tag-autocomplete" onSubmit={(e) => { e.preventDefault(); void confirmTypedName(); }}>
      <div class="tag-autocomplete__field">
        <Input
          type="search"
          value={query}
          placeholder="Add a tag…"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId.current}
          aria-activedescendant={open && suggestions[activeIndex] ? `${listId.current}-${suggestions[activeIndex].id}` : undefined}
          disabled={saving}
          data-testid="tag-autocomplete-input"
          onFocus={onFocus}
          onBlur={() => window.setTimeout(() => setOpen(false), 100)}
          onInput={(e) => { setQuery((e.target as HTMLInputElement).value); setOpen(true); void loadTags(); }}
          onKeyDown={onKeyDown}
        />
        {open && (
          <div class="tag-autocomplete__menu" role="listbox" id={listId.current} data-testid="tag-autocomplete-list">
            {loading ? (
              <div class="tag-autocomplete__status">Loading tags…</div>
            ) : suggestions.length > 0 ? (
              suggestions.map((tag, index) => (
                <button
                  key={tag.id}
                  id={`${listId.current}-${tag.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  class={`tag-autocomplete__option${index === activeIndex ? ' tag-autocomplete__option--active' : ''}`}
                  data-testid="tag-autocomplete-option"
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { void assignExisting(tag); }}
                >
                  <span>{tag.name}</span>
                </button>
              ))
            ) : (
              <div class="tag-autocomplete__status" data-testid="tag-autocomplete-create">
                {query.trim() ? `Press Enter to create “${query.trim()}”.` : 'No available tags.'}
              </div>
            )}
          </div>
        )}
      </div>
      <Button size="sm" variant="secondary" type="submit" disabled={saving || !query.trim()} data-testid="tag-autocomplete-submit">
        Add
      </Button>
    </form>
  );
}
