import type { JSX } from 'preact';

type SelectProps = JSX.IntrinsicElements['select'];

export function Select({ class: cls, children, ...rest }: SelectProps) {
  return (
    <select class={['input select', cls ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  );
}
