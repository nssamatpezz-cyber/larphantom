import { registerSW } from 'virtual:pwa-register';
import { useStore } from './store';

/** Apply an installed update after editing finishes, without discarding the latest tick. */
export function createUpdateReloadGuard(persist: () => boolean, reload: () => void) {
  let pending = false;
  let queued = false;
  let disposed = false;
  let applied = false;
  const editing = () => {
    const active = document.activeElement;
    return Boolean(document.getElementById('launch-screen'))
      || Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
      || active instanceof HTMLInputElement
      || active instanceof HTMLTextAreaElement
      || active instanceof HTMLElement && active.isContentEditable;
  };
  const observer = new MutationObserver(() => schedule());
  const attempt = () => {
    if (disposed || !pending || editing()) return;
    let saved = false;
    try { saved = persist(); } catch { /* Keep the current session when storage is unavailable. */ }
    // A failed save must never cause an automatic reload or a retry/write loop.
    pending = false;
    observer.disconnect();
    if (saved) { applied = true; reload(); }
  };
  const schedule = () => {
    if (disposed || !pending || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; attempt(); });
  };
  document.addEventListener('focusout', schedule);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pageshow', schedule);
  return {
    requestReload() {
      if (disposed || pending || applied) return;
      pending = true;
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'role', 'contenteditable'] });
      attempt();
    },
    dispose() {
      disposed = true;
      pending = false;
      observer.disconnect();
      document.removeEventListener('focusout', schedule);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('pageshow', schedule);
    },
  };
}

if (import.meta.env.PROD) {
  const guard = createUpdateReloadGuard(() => {
    useStore.getState().update(data => data);
    return !useStore.getState().error;
  }, () => window.location.reload());
  let registration: ServiceWorkerRegistration | undefined;
  const checkForUpdate = () => {
    if (document.visibilityState !== 'hidden') void registration?.update().catch(() => undefined);
  };
  registerSW({
    immediate: true,
    onNeedReload: guard.requestReload,
    onRegisteredSW(_url, registered) { registration = registered; checkForUpdate(); },
  });
  window.addEventListener('pageshow', checkForUpdate);
  document.addEventListener('visibilitychange', checkForUpdate);
  if (import.meta.hot) import.meta.hot.dispose(() => {
    guard.dispose();
    window.removeEventListener('pageshow', checkForUpdate);
    document.removeEventListener('visibilitychange', checkForUpdate);
  });
}
