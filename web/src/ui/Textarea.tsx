import type { JSX } from 'preact';

type TextareaProps = JSX.IntrinsicElements['textarea'];

export function Textarea({ class: cls, ...rest }: TextareaProps) {
  return <textarea class={['input textarea', cls ?? ''].filter(Boolean).join(' ')} {...rest} />;
}
