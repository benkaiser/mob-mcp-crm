import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
}

/** Elements that can receive keyboard focus inside the dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal dialog. Closes on Escape and backdrop click. While open it
 * traps focus inside the dialog (Tab/Shift+Tab wrap at the boundaries), moves
 * focus to the first focusable element on open, and restores focus to whatever
 * was focused before it opened on close.
 *
 * We use useLayoutEffect (not useEffect) so the focus move and the document
 * keydown listener are in place synchronously, before the browser paints. With
 * a plain effect there's a window where the dialog is visible but focus is
 * still on the trigger and Escape isn't wired up yet.
 *
 * The effect depends only on `open`; onClose is read through a ref so that a
 * parent re-render (callers usually pass an inline arrow) doesn't tear down and
 * re-run the effect, which would thrash focus back to the trigger.
 */
export function Modal({ open, title, onClose, children, footer, wide = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;

    // Remember the trigger so focus can return to it when the modal closes.
    restoreRef.current = document.activeElement as HTMLElement | null;

    // Move focus into the dialog (first focusable element, else the dialog).
    const dialog = dialogRef.current;
    const focusables = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (focusables && focusables.length ? focusables[0] : dialog)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      // Wrap focus at the boundaries to keep it trapped inside the dialog.
      if (e.shiftKey && (active === first || active === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Return focus to the trigger element on close.
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div class="modal-backdrop" onClick={onClose} data-testid="modal-backdrop">
      <div
        ref={dialogRef}
        class={`modal${wide ? ' modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="modal__header">
          <h2 class="modal__title" data-testid="modal-title">{title}</h2>
          <button class="modal__close" onClick={onClose} aria-label="Close" data-testid="modal-close">×</button>
        </div>
        <div class="modal__body" data-testid="modal-body">{children}</div>
        {footer && <div class="modal__footer" data-testid="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
