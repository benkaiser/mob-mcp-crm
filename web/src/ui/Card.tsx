import type { ComponentChildren, JSX } from 'preact';

interface CardProps extends JSX.HTMLAttributes<HTMLDivElement> {
  children?: ComponentChildren;
}

export function Card({ children, class: cls, ...rest }: CardProps) {
  return (
    <div class={['card', cls ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
