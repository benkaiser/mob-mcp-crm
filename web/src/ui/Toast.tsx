import { signal } from '@preact/signals';

export type ToastTone = 'default' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

/** Global toast stack, rendered by <ToastHost />. */
export const toasts = signal<Toast[]>([]);

let nextId = 1;

/** Push a toast; auto-dismisses after `duration` ms (default 4000). */
export function showToast(message: string, tone: ToastTone = 'default', duration = 4000): void {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, message, tone }];
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

const TONE_CLASS: Record<ToastTone, string> = {
  default: '',
  success: 'toast--success',
  error: 'toast--error',
};

/** Renders the fixed toast stack. Mount once near the app root. */
export function ToastHost() {
  if (toasts.value.length === 0) return null;
  return (
    <div class="toast-stack" data-testid="toast-stack">
      {toasts.value.map((t) => (
        <div
          key={t.id}
          class={['toast', TONE_CLASS[t.tone]].filter(Boolean).join(' ')}
          data-testid="toast"
          data-tone={t.tone}
          onClick={() => dismissToast(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
