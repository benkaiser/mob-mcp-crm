import type { ComponentChildren } from 'preact';

interface EmptyStateProps {
  title: string;
  description?: string;
  children?: ComponentChildren;
}

export function EmptyState({ title, description, children }: EmptyStateProps) {
  return (
    <div class="empty-state" data-testid="empty-state">
      <div class="empty-state__title">{title}</div>
      {description && <p class="muted">{description}</p>}
      {children}
    </div>
  );
}
