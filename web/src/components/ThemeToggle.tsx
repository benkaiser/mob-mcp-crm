import { themePref, resolvedTheme, cycleTheme } from '../store/theme';
import { Icon, type IconName } from '../ui/Icon';

/**
 * Sidebar theme toggle. Cycles light → dark → system on click. Shows the icon
 * for the current *preference* (sun / moon / monitor) with a tooltip describing
 * what a click will do. Uses signals, so it re-renders when the theme changes.
 */
const ICON: Record<string, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' };
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
      <Icon name={ICON[pref]} size={18} />
    </button>
  );
}
