import type { ComponentChildren } from 'preact';

type Tone = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  tone?: Tone;
  children?: ComponentChildren;
}

const TONE_CLASS: Record<Tone, string> = {
  default: '',
  primary: 'badge--primary',
  success: 'badge--success',
  warning: 'badge--warning',
  danger: 'badge--danger',
};

export function Badge({ tone = 'default', children }: BadgeProps) {
  return <span class={['badge', TONE_CLASS[tone]].filter(Boolean).join(' ')} data-testid="badge" data-tone={tone}>{children}</span>;
}
