import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

/** Keep keyboard focus inside the foremost overlay and restore its opener. */
export function useDialogFocus(dialogRef: RefObject<HTMLElement | null>, initialFocusRef?: RefObject<HTMLElement | null>, openerSelector?: string) {
  // Touch Safari does not focus buttons on tap; keep an explicit accessible return point.
  const openerRef = useRef<HTMLElement | null>(typeof document !== 'undefined' ? document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : openerSelector ? document.querySelector<HTMLElement>(openerSelector) : null : null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const isForemost = () => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      return dialogs[dialogs.length - 1] === dialog;
    };
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden' && !element.closest('[inert]'));
    const focusFirst = () => (initialFocusRef?.current ?? controls()[0])?.focus({ preventScroll: true });
    if (isForemost() && !dialog.contains(document.activeElement)) focusFirst();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !isForemost()) return;
      const targets = controls();
      if (!targets.length) { event.preventDefault(); return; }
      const first = targets[0]; const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus({ preventScroll: true }); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus({ preventScroll: true }); }
    };
    const onFocus = () => { if (isForemost() && !dialog.contains(document.activeElement)) focusFirst(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      const opener = openerRef.current;
      const focusedDialog = document.activeElement?.closest('[role="dialog"][aria-modal="true"]');
      if (!dialog.isConnected && opener?.isConnected && !focusedDialog) opener.focus({ preventScroll: true });
    };
  }, [dialogRef, initialFocusRef]);
}
