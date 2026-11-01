import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LAUNCH_HOLD_MS, LAUNCH_FADE_MS, startLaunchScreen } from './LaunchScreen';

let cleanup: (() => void) | undefined;
function prepare(reduce = false) {
  const preference = Object.assign(new EventTarget(), { matches: reduce });
  vi.stubGlobal('matchMedia', () => preference);
  document.documentElement.dataset.launch = 'visible';
  document.documentElement.style.setProperty('--viewport-background', '#000000');
  document.head.innerHTML = '<meta name="theme-color" content="#ab9ff2">';
  document.body.innerHTML = '<div id="launch-screen"><img src="/app-icon.svg" alt=""></div><div id="root" inert aria-hidden="true"></div>';
  cleanup = startLaunchScreen();
  return { root: document.getElementById('root')!, launch: document.getElementById('launch-screen')! };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  vi.useRealTimers(); vi.unstubAllGlobals();
  document.body.innerHTML = ''; document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-launch');
  document.documentElement.style.removeProperty('--viewport-background');
});

describe('launch screen lifecycle', () => {
  it('blocks interaction through the hold, then reveals the existing app without changing its data', () => {
    const { root, launch } = prepare();
    expect(root.inert).toBe(true);
    vi.advanceTimersByTime(LAUNCH_HOLD_MS - 1);
    expect(launch.isConnected).toBe(true);
    expect(document.documentElement.dataset.launch).toBe('visible');
    vi.advanceTimersByTime(1);
    expect(document.documentElement.dataset.launch).toBe('leaving');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    vi.advanceTimersByTime(LAUNCH_FADE_MS + 50);
    expect(launch.isConnected).toBe(false);
    expect(root.inert).toBe(false);
    expect(root.hasAttribute('aria-hidden')).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#000000');
  });

  it('uses an immediate reveal after the hold when Reduce Motion is enabled', () => {
    const { launch, root } = prepare(true);
    vi.advanceTimersByTime(LAUNCH_HOLD_MS);
    expect(launch.isConnected).toBe(false); expect(root.inert).toBe(false);
  });

  it('restores the saved light appearance instead of forcing dark mode', () => {
    prepare(true);
    document.documentElement.style.setProperty('--viewport-background', '#f6f5fa');
    vi.advanceTimersByTime(LAUNCH_HOLD_MS);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe('#f6f5fa');
  });

  it('cancels pending timers on cleanup and does not mutate a removed app', () => {
    const { launch } = prepare(); cleanup?.();
    vi.advanceTimersByTime(5000);
    expect(launch.isConnected).toBe(true);
  });

  it('does not replay when the static launch element has already been removed', () => {
    const { root } = prepare(true);
    vi.advanceTimersByTime(LAUNCH_HOLD_MS);
    cleanup = startLaunchScreen();
    vi.advanceTimersByTime(5000);
    expect(document.getElementById('launch-screen')).toBeNull();
    expect(root.inert).toBe(false);
  });
});
