import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'wouter-preact';
import { Modal } from '../ui';

/**
 * App-wide keyboard shortcuts (Stripe-style).
 *
 * Press `?` anywhere outside a text field to open a cheat-sheet overlay. Single
 * keys fire actions directly; a `g` prefix starts a "go to" sequence (e.g.
 * `g` then `c` → Contacts). `/` jumps to the search box.
 *
 * Shortcuts are suppressed while typing in an input/textarea/select or any
 * contentEditable element, and while a modifier (⌘/Ctrl/Alt) is held, so they
 * never clobber normal typing or browser shortcuts.
 */

interface Shortcut {
  keys: string;
  label: string;
  run: (nav: (to: string) => void) => void;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/** Focus the global search box if it's present in the DOM. */
function focusSearch() {
  const el = document.querySelector<HTMLInputElement>('[data-testid="shell-search-input"]');
  el?.focus();
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Create',
    items: [
      { keys: 'c', label: 'New contact', run: (nav) => nav('/contacts/new') },
      { keys: 'n', label: 'New note', run: (nav) => nav('/notes/new') },
      { keys: 'a', label: 'Log activity', run: (nav) => nav('/activities/new') },
      { keys: 'r', label: 'New reminder', run: (nav) => nav('/reminders/new') },
      { keys: 't', label: 'New task', run: (nav) => nav('/tasks/new') },
    ],
  },
  {
    title: 'Go to',
    items: [
      { keys: 'g d', label: 'Dashboard', run: (nav) => nav('/') },
      { keys: 'g c', label: 'Contacts', run: (nav) => nav('/contacts') },
      { keys: 'g s', label: 'Search', run: (nav) => nav('/search') },
      { keys: 'g i', label: 'Import', run: (nav) => nav('/import') },
      { keys: 'g e', label: 'Data & export', run: (nav) => nav('/data') },
      { keys: 'g ,', label: 'Settings', run: (nav) => nav('/settings') },
    ],
  },
  {
    title: 'General',
    items: [
      { keys: '/', label: 'Focus search', run: () => focusSearch() },
      { keys: '?', label: 'Show this help', run: () => {} },
    ],
  },
];

// Map of the second key in a `g _` sequence → destination route.
const GO_TO: Record<string, string> = {
  d: '/',
  c: '/contacts',
  s: '/search',
  i: '/import',
  e: '/data',
  ',': '/settings',
};

/** True when the event target is a text-entry context we shouldn't hijack. */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export function KeyboardShortcuts() {
  const [, navigate] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  // When the user presses `g`, we wait briefly for the second key.
  const pendingG = useRef(false);
  const gTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep navigate in a ref so the document listener (attached once) always
  // calls the latest router function without re-subscribing.
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    function clearPendingG() {
      pendingG.current = false;
      if (gTimer.current) { clearTimeout(gTimer.current); gTimer.current = null; }
    }

    function onKeyDown(e: KeyboardEvent) {
      // Never interfere with modified chords or while typing.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const nav = (to: string) => navRef.current(to);

      // Resolve a pending `g` sequence first.
      if (pendingG.current) {
        const dest = GO_TO[e.key];
        clearPendingG();
        if (dest) {
          e.preventDefault();
          nav(dest);
        }
        return;
      }

      // `?` (typically Shift+/) toggles the help overlay.
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // While the overlay is open, only `?`/Escape matter (Escape handled by
      // the Modal itself); swallow other shortcut keys.
      if (helpOpen) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          focusSearch();
          return;
        case 'g':
          pendingG.current = true;
          gTimer.current = setTimeout(clearPendingG, 1200);
          return;
        case 'c': e.preventDefault(); nav('/contacts/new'); return;
        case 'n': e.preventDefault(); nav('/notes/new'); return;
        case 'a': e.preventDefault(); nav('/activities/new'); return;
        case 'r': e.preventDefault(); nav('/reminders/new'); return;
        case 't': e.preventDefault(); nav('/tasks/new'); return;
        default: return;
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [helpOpen]);

  return (
    <Modal open={helpOpen} title="Keyboard shortcuts" onClose={() => setHelpOpen(false)}>
      <div class="shortcuts" data-testid="shortcuts-help">
        {SHORTCUT_GROUPS.map((group) => (
          <div class="shortcuts__group" key={group.title}>
            <h3 class="shortcuts__title">{group.title}</h3>
            <dl class="shortcuts__list">
              {group.items.map((s) => (
                <div class="shortcuts__row" key={s.keys}>
                  <dt class="shortcuts__keys">
                    {s.keys.split(' ').map((k, i) => (
                      <kbd class="kbd" key={i}>{k === ',' ? ',' : k}</kbd>
                    ))}
                  </dt>
                  <dd class="shortcuts__label">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Modal>
  );
}
