interface Tab {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (id: string) => void;
}

/** Simple keyboard-accessible tab bar. */
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div class="tabs" role="tablist" data-testid="tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === active}
          data-testid={`tab-${t.id}`}
          class={`tabs__tab${t.id === active ? ' tabs__tab--active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
