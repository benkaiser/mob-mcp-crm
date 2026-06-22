import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Link, useRoute, useLocation } from 'wouter-preact';
import { user } from '../store/session';
import { apiGet } from '../api/client';
import type { GlobalSearchResult, SearchEntityType, SearchResult } from '../api/types';
import { Input } from '../ui';
import { InstallPrompt } from './InstallPrompt';
import { ThemeToggle } from './ThemeToggle';

interface NavChild {
  href: string;
  label: string;
  match: string;
  exact?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  /** Match pattern for active-state highlighting. */
  match: string;
  /** Exact match only — no descendant prefix highlighting. */
  exact?: boolean;
  /** Sub-items revealed when the parent section is active. */
  children?: NavChild[];
}

// Top-level IA. Contacts owns its descendant routes (All / Duplicates) so the
// old double-highlight bug goes away: the parent lights when its section is
// active, and the precise sub-item highlights on its own.
const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', match: '/', exact: true },
  {
    href: '/contacts',
    label: 'Contacts',
    match: '/contacts',
    children: [
      { href: '/contacts', label: 'All contacts', match: '/contacts', exact: true },
      { href: '/contacts/duplicates', label: 'Duplicates', match: '/contacts/duplicates' },
    ],
  },
  { href: '/search', label: 'Search', match: '/search' },
  { href: '/import', label: 'Import', match: '/import' },
  { href: '/data', label: 'Data', match: '/data' },
  { href: '/settings', label: 'Settings', match: '/settings' },
];

function NavLink({ item }: { item: NavItem }) {
  const [active] = useRoute(item.exact ? item.match : `${item.match}/*?`);
  const childActive = useChildActive(item);
  const sectionActive = active || childActive;
  return (
    <div class="sidebar__group">
      <Link
        href={item.href}
        class={`sidebar__link${sectionActive ? ' sidebar__link--active' : ''}`}
        data-testid={`nav-${item.label.toLowerCase()}`}
      >
        {item.label}
      </Link>
      {item.children && sectionActive && (
        <div class="sidebar__sublist">
          {item.children.map((c) => (
            <SubNavLink key={c.href} child={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function useChildActive(item: NavItem): boolean {
  const [loc] = useLocation();
  if (!item.children) return false;
  return item.children.some((c) =>
    c.exact ? loc === c.match : loc === c.match || loc.startsWith(`${c.match}/`),
  );
}

function SubNavLink({ child }: { child: NavChild }) {
  const [active] = useRoute(child.exact ? child.match : `${child.match}/*?`);
  return (
    <Link
      href={child.href}
      class={`sidebar__sublink${active ? ' sidebar__sublink--active' : ''}`}
      data-testid={`subnav-${child.label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {child.label}
    </Link>
  );
}

// ─── Typeahead search ──────────────────────────────────────────────
// Debounced dropdown showing top hits across entity types while typing.
// Enter (or "See all results") goes to the full /search page.

const TYPEAHEAD_LABELS: Partial<Record<SearchEntityType, string>> = {
  contacts: 'Contacts',
  notes: 'Notes',
  activities: 'Activities',
  tasks: 'Tasks',
  gifts: 'Gifts',
  reminders: 'Reminders',
  life_events: 'Life events',
};

const TYPEAHEAD_ORDER: SearchEntityType[] = [
  'contacts', 'notes', 'activities', 'tasks', 'reminders', 'gifts', 'life_events',
];

function routeFor(type: SearchEntityType, r: SearchResult): string {
  switch (type) {
    case 'contacts': return `/contacts/${r.id}`;
    case 'notes': return `/notes/${r.id}`;
    case 'activities': return `/activities/${r.id}`;
    case 'life_events': return `/life-events/${r.id}`;
    case 'gifts': return `/gifts/${r.id}`;
    case 'tasks': return `/tasks/${r.id}`;
    case 'reminders': return `/reminders/${r.id}`;
    case 'debts': return `/debts/${r.id}`;
    default: return r.contact_id ? `/contacts/${r.contact_id}` : '/search';
  }
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
}

function ShellSearch() {
  const [, navigate] = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced fetch of the top few hits while typing.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResult(null); setLoading(false); return; }
    const handle = setTimeout(() => {
      setLoading(true);
      apiGet<GlobalSearchResult>(`/search?q=${encodeURIComponent(term)}&limit=4`)
        .then(({ data }) => setResult(data))
        .catch(() => setResult(null))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function goToSearch() {
    if (q.trim()) {
      navigate(`/search?q=${encodeURIComponent(q.trim())}`);
      setOpen(false);
    }
  }

  function submit(e: Event) {
    e.preventDefault();
    goToSearch();
  }

  function pick(href: string) {
    navigate(href);
    setOpen(false);
    setQ('');
    setActiveIndex(-1);
  }

  const groups = result
    ? TYPEAHEAD_ORDER.filter((t) => (result.results[t]?.length ?? 0) > 0)
    : [];
  const showDropdown = open && q.trim().length > 0;

  // Flatten grouped results into a single keyboard-navigable list, in the same
  // visual order they're rendered. The trailing "see all" row is index === len.
  const flat = groups.flatMap((type) =>
    result!.results[type].map((r) => ({ id: `${type}-${r.id}`, href: routeFor(type, r) })),
  );
  const seeAllIndex = flat.length; // "see all" sits after the last result.

  // Reset the highlight whenever the result set changes.
  useEffect(() => { setActiveIndex(-1); }, [result]);

  function onKeyDown(e: KeyboardEvent) {
    if (!showDropdown) return;
    const max = seeAllIndex; // inclusive: results 0..len-1, plus "see all" at len
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i >= max ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? max : i - 1));
    } else if (e.key === 'Enter') {
      // Let the highlighted item win; otherwise the form submit → see-all runs.
      if (activeIndex >= 0 && activeIndex < flat.length) {
        e.preventDefault();
        pick(flat[activeIndex].href);
      } else if (activeIndex === seeAllIndex) {
        e.preventDefault();
        goToSearch();
      }
      // activeIndex === -1: fall through to form submit (goToSearch).
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const activeId =
    activeIndex >= 0 && activeIndex < flat.length
      ? `typeahead-opt-${flat[activeIndex].id}`
      : activeIndex === seeAllIndex
        ? 'typeahead-see-all'
        : undefined;

  return (
    <div class="shell-search" ref={boxRef}>
      <form onSubmit={submit} role="search">
        <Input
          type="search"
          placeholder="Search…"
          value={q}
          aria-label="Search"
          autocomplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="shell-search-listbox"
          aria-activedescendant={activeId}
          data-testid="shell-search-input"
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onInput={(e) => { setQ((e.target as HTMLInputElement).value); setOpen(true); }}
        />
      </form>
      {showDropdown && (
        <div class="typeahead" data-testid="shell-search-dropdown">
          {loading && !result && <div class="typeahead__status">Searching…</div>}
          {result && groups.length === 0 && !loading && (
            <div class="typeahead__status">No matches</div>
          )}
          <div id="shell-search-listbox" role="listbox" aria-label="Search results">
            {groups.map((type) => (
              <div class="typeahead__group" key={type} data-entity-type={type}>
                <div class="typeahead__label" id={`typeahead-grp-${type}`}>{TYPEAHEAD_LABELS[type] ?? type}</div>
                {result!.results[type].map((r) => {
                  const optId = `${type}-${r.id}`;
                  const idx = flat.findIndex((f) => f.id === optId);
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      type="button"
                      id={`typeahead-opt-${optId}`}
                      role="option"
                      aria-selected={isActive}
                      class={`typeahead__item${isActive ? ' typeahead__item--active' : ''}`}
                      key={optId}
                      data-testid="shell-search-result"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => pick(routeFor(type, r))}
                    >
                      <span class="typeahead__avatar" aria-hidden="true">
                        {type === 'contacts' ? initials(r.title) : '#'}
                      </span>
                      <span class="typeahead__text">
                        <span class="typeahead__name">{r.title}</span>
                        {(r.snippet || r.contact_name) && (
                          <span class="typeahead__sub">{r.contact_name || r.snippet}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
            {q.trim() && (
              <button
                type="button"
                id="typeahead-see-all"
                role="option"
                aria-selected={activeIndex === seeAllIndex}
                class={`typeahead__all${activeIndex === seeAllIndex ? ' typeahead__all--active' : ''}`}
                onMouseEnter={() => setActiveIndex(seeAllIndex)}
                onClick={goToSearch}
                data-testid="shell-search-see-all"
              >
                See all results for “{q.trim()}”
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ComponentChildren }) {
  const me = user.value;
  return (
    <div class="app-shell">
      <a href="#main-content" class="skip-link" data-testid="skip-link">Skip to content</a>
      <aside class="sidebar">
        <div class="sidebar__brand">
          <img class="sidebar__brand-logo" src="/app/logo.svg" alt="" aria-hidden="true" width="28" height="28" />
          <span>Mob CRM</span>
        </div>
        <ShellSearch />
        <Link href="/contacts/new" class="sidebar__cta" data-testid="sidebar-new-contact">
          <span aria-hidden="true">＋</span> New contact
        </Link>
        {/* Secondary quick-add links: smaller, ghost-styled so the primary
            "New contact" CTA remains visually dominant. */}
        <div class="sidebar__quick" data-testid="sidebar-quick-add">
          <div class="sidebar__quick-label">Quick add</div>
          <Link href="/notes/new" class="sidebar__quick-link" data-testid="sidebar-new-note">
            <span aria-hidden="true">+</span> Note
          </Link>
          <Link href="/activities/new" class="sidebar__quick-link" data-testid="sidebar-new-activity">
            <span aria-hidden="true">+</span> Activity
          </Link>
          <Link href="/reminders/new" class="sidebar__quick-link" data-testid="sidebar-new-reminder">
            <span aria-hidden="true">+</span> Reminder
          </Link>
          <Link href="/tasks/new" class="sidebar__quick-link" data-testid="sidebar-new-task">
            <span aria-hidden="true">+</span> Task
          </Link>
        </div>
        <nav class="sidebar__nav">
          {NAV.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </nav>
        <div class="sidebar__user" data-testid="sidebar-user">
          {me && (
            <>
              <div class="sidebar__user-name" data-testid="sidebar-user-name">{me.name}</div>
              <div class="sidebar__user-plan" data-testid="sidebar-user-plan">{me.plan} plan</div>
            </>
          )}
          <InstallPrompt />
          <div class="sidebar__user-actions">
            {/* Server-rendered logout route — full navigation, not SPA. */}
            <a href="/web/logout" data-testid="logout-link">Log out</a>
            <ThemeToggle />
          </div>
        </div>
      </aside>
      <main class="main" id="main-content" tabIndex={-1}>{children}</main>
    </div>
  );
}
