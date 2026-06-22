import { signal } from '@preact/signals';

/**
 * Theme store — light / dark / system.
 *
 * The actual <html data-theme> attribute is first set by an inline boot script
 * in index.html (before paint, to avoid a flash). This store keeps the user's
 * preference in sync, persists it to localStorage under 'mob-theme', and—when
 * the preference is 'system'—follows OS changes live via matchMedia.
 *
 *   - 'light' | 'dark' : explicit override, persisted.
 *   - 'system'         : no stored key; resolve from prefers-color-scheme.
 */
export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'mob-theme';

function prefersDark(): boolean {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* ignore */ }
  return 'system';
}

/** The user's chosen preference. */
export const themePref = signal<ThemePref>(readPref());

/** The resolved mode actually applied to <html> ('light' | 'dark'). */
export const resolvedTheme = signal<'light' | 'dark'>(
  themePref.value === 'system' ? (prefersDark() ? 'dark' : 'light') : themePref.value,
);

function apply(mode: 'light' | 'dark'): void {
  resolvedTheme.value = mode;
  const root = document.documentElement;
  if (mode === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
}

/** Set and persist a preference; updates the DOM immediately. */
export function setTheme(pref: ThemePref): void {
  themePref.value = pref;
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch { /* ignore */ }
  apply(pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref);
}

/** Cycle light → dark → system (used by the sidebar toggle). */
export function cycleTheme(): void {
  const order: ThemePref[] = ['light', 'dark', 'system'];
  const next = order[(order.indexOf(themePref.value) + 1) % order.length];
  setTheme(next);
}

/** Begin following OS changes while the preference is 'system'. Call once at boot. */
export function initThemeWatcher(): void {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', (e) => {
    if (themePref.value === 'system') apply(e.matches ? 'dark' : 'light');
  });
}
