import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpdateReloadGuard } from './pwa';

vi.mock('virtual:pwa-register', () => ({ registerSW: vi.fn() }));

const disposers: Array<() => void> = [];
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
function guard(persist = vi.fn(() => true), reload = vi.fn()) {
  const coordinator = createUpdateReloadGuard(persist, reload);
  disposers.push(coordinator.dispose);
  return { ...coordinator, persist, reload };
}
beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); document.body.innerHTML = ''; });

describe('safe PWA update reload', () => {
  it('persists the current snapshot before one reload, even if activation is reported twice', () => {
    const events: string[] = [];
    const state = guard(vi.fn(() => { events.push('saved'); return true; }), vi.fn(() => events.push('reloaded')));
    state.requestReload(); state.requestReload();
    expect(events).toEqual(['saved', 'reloaded']);
  });

  it('keeps a transaction dialog open and applies the update only after dismissal', async () => {
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    const state = guard(); state.requestReload();
    expect(state.persist).not.toHaveBeenCalled(); expect(state.reload).not.toHaveBeenCalled();
    dialog.remove(); await settle();
    expect(state.persist).toHaveBeenCalledOnce(); expect(state.reload).toHaveBeenCalledOnce();
  });

  it('waits for the launch screen to finish before applying a pending update', async () => {
    const launch = document.createElement('div'); launch.id = 'launch-screen';
    document.body.append(launch);
    const state = guard(); state.requestReload();
    expect(state.reload).not.toHaveBeenCalled();
    launch.remove(); await settle();
    expect(state.persist).toHaveBeenCalledOnce(); expect(state.reload).toHaveBeenCalledOnce();
  });

  it.each(['input', 'textarea'])('defers while an active %s is being edited', async tag => {
    const input = document.createElement(tag) as HTMLInputElement | HTMLTextAreaElement;
    document.body.append(input); input.focus();
    const state = guard(); state.requestReload();
    expect(state.persist).not.toHaveBeenCalled();
    input.blur(); await settle();
    expect(state.persist).toHaveBeenCalledOnce(); expect(state.reload).toHaveBeenCalledOnce();
  });

  it('protects an active contenteditable region', async () => {
    const editor = document.createElement('div'); editor.tabIndex = 0;
    editor.setAttribute('contenteditable', 'true');
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    document.body.append(editor); editor.focus();
    const state = guard(); state.requestReload();
    expect(state.reload).not.toHaveBeenCalled();
    editor.blur(); await settle(); expect(state.reload).toHaveBeenCalledOnce();
  });

  it('retains the session and avoids write loops when persistence fails', async () => {
    const state = guard(vi.fn(() => false)); state.requestReload();
    document.body.append(document.createElement('div'));
    window.dispatchEvent(new Event('pageshow')); await settle();
    expect(state.persist).toHaveBeenCalledOnce(); expect(state.reload).not.toHaveBeenCalled();
  });

  it('does not reload if the persistence callback throws', () => {
    const state = guard(vi.fn(() => { throw new Error('Storage unavailable'); }));
    expect(() => state.requestReload()).not.toThrow(); expect(state.reload).not.toHaveBeenCalled();
  });

  it('cancels a pending update guard when disposed', async () => {
    const input = document.createElement('input'); document.body.append(input); input.focus();
    const state = guard(); state.requestReload(); state.dispose();
    input.blur(); window.dispatchEvent(new Event('pageshow')); await settle();
    expect(state.persist).not.toHaveBeenCalled(); expect(state.reload).not.toHaveBeenCalled();
  });
});
