import type { ComponentChildren, VNode } from 'preact';
import { cloneElement, isValidElement, toChildArray } from 'preact';
import { useId } from 'preact/hooks';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children?: ComponentChildren;
}

/**
 * A labelled form field row with optional error/hint text.
 *
 * Accessibility (bean mob-crm-nbtz): the label is associated with the control
 * via `for`/`id`. When the caller doesn't supply an id we generate one and
 * inject it into the single child control, and we wire up `aria-describedby`
 * (hint/error) plus `aria-invalid` so screen readers announce the error text
 * against the field.
 */
export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  const generatedId = useId();
  const controlId = htmlFor ?? generatedId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  // Enrich the single element child (the form control) with ARIA wiring.
  // Non-element children (plain text, fragments) pass through unchanged.
  const describedBy =
    [error ? errorId : null, hint && !error ? hintId : null].filter(Boolean).join(' ') || undefined;
  const enriched = toChildArray(children).map((child) => {
    if (!isValidElement(child)) return child;
    const el = child as VNode<Record<string, unknown>>;
    return cloneElement(el, {
      id: el.props.id ?? controlId,
      'aria-describedby': el.props['aria-describedby'] ?? describedBy,
      'aria-invalid': error ? 'true' : el.props['aria-invalid'],
    });
  });

  return (
    <div class="field">
      <label class="field__label" for={controlId}>{label}</label>
      {enriched}
      {hint && !error && <div class="field__hint" id={hintId}>{hint}</div>}
      {error && <div class="field__error" id={errorId} role="alert">{error}</div>}
    </div>
  );
}
