import type { JSX } from 'preact';

type InputProps = JSX.IntrinsicElements['input'];

export function Input({ class: cls, ...rest }: InputProps) {
  return <input class={['input', cls ?? ''].filter(Boolean).join(' ')} {...rest} />;
}
