import { useState } from 'preact/hooks';
import { Button } from './Button';

interface CopyFieldProps {
  value: string;
  /** Optional label rendered above the field. */
  label?: string;
  /** When true, render the value in a monospace box (e.g. tokens/secrets). */
  mono?: boolean;
}

/** A read-only value with a copy-to-clipboard button. */
export function CopyField({ value, label, mono = true }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback for non-secure contexts / older browsers.
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div class="copy-field">
      {label && <div class="copy-field__label">{label}</div>}
      <div class="copy-field__row">
        <code class={mono ? 'copy-field__value copy-field__value--mono' : 'copy-field__value'}>
          {value}
        </code>
        <Button variant="secondary" size="sm" onClick={copy} type="button">
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  );
}
