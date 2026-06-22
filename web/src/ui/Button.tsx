import type { ComponentChildren, JSX } from 'preact';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends Omit<JSX.IntrinsicElements['button'], 'size'> {
  variant?: Variant;
  size?: 'sm' | 'md';
  children?: ComponentChildren;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: '',
  secondary: 'btn--secondary',
  danger: 'btn--danger',
  ghost: 'btn--ghost',
};

export function Button({ variant = 'primary', size = 'md', children, class: cls, ...rest }: ButtonProps) {
  const classes = ['btn', VARIANT_CLASS[variant], size === 'sm' ? 'btn--sm' : '', cls ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button class={classes} {...rest}>
      {children}
    </button>
  );
}
