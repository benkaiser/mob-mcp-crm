interface AvatarProps {
  name: string;
  url?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

/** Initials-based avatar; renders an image if a url is provided. */
export function Avatar({ name, url, size = 'md' }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
  const cls = ['avatar', size === 'sm' ? 'avatar--sm' : size === 'lg' ? 'avatar--lg' : '']
    .filter(Boolean)
    .join(' ');
  if (url) {
    return <img class={cls} src={url} alt={name} />;
  }
  return <span class={cls} aria-hidden="true">{initials}</span>;
}
