import { themePref, resolvedTheme, cycleTheme } from '../store/theme';

/**
 * Sidebar theme toggle. Cycles light → dark → system on click. Shows the icon
 * for the current *preference* (sun / moon / auto) with a tooltip describing
 * what a click will do. Uses signals, so it re-renders when the theme changes.
 */
const ICON: Record<string, string> = { light: '☀️', dark: '🌙', system: '🖥️' };
const NEXT_LABEL: Record<string, string> = {
  light: 'Switch to dark',
  dark: 'Switch to system',
  system: 'Switch to light',
};

export function ThemeToggle() {
  const pref = themePref.value;
  const label = `Theme: ${pref} (${resolvedTheme.value}). ${NEXT_LABEL[pref]}.`;
  return (
    <button
      type="button"
      class="theme-toggle"
      onClick={cycleTheme}
      title={label}
      aria-label={label}
      data-testid="theme-toggle"
      data-theme-pref={pref}
    >
      <span aria-hidden="true">{ICON[pref]}</span>
    </button>
  );
}
