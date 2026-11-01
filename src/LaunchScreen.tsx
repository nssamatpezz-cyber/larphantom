import { useLayoutEffect } from 'react';
import { preferHighRefresh } from './motion';

export const LAUNCH_HOLD_MS = 1400;
export const LAUNCH_FADE_MS = 320;

/** The initial image is in HTML so it paints before React or market requests. */
export function startLaunchScreen() {
  const splash = document.getElementById('launch-screen');
  const root = document.getElementById('root');
  if (!splash || !root) return () => {};
  const html = document.documentElement;
  const theme = document.querySelector('meta[name="theme-color"]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;
  let fading = false;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  const animations: Animation[] = [];
  const savedStart = Number(splash.dataset.startedAt);
  const startedAt = splash.dataset.startedAt !== undefined && Number.isFinite(savedStart) ? savedStart : performance.now();
  splash.dataset.startedAt = String(startedAt);
  root.inert = true;
  root.setAttribute('aria-hidden', 'true');
  theme?.setAttribute('content', '#ab9ff2');

  const finish = () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(holdTimer);
    clearTimeout(finishTimer);
    reduced.removeEventListener('change', onPreference);
    splash.removeEventListener('transitionend', onTransitionEnd);
    animations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
    html.removeAttribute('data-launch');
    root.inert = false;
    root.removeAttribute('inert');
    root.removeAttribute('aria-hidden');
    theme?.setAttribute('content', html.style.getPropertyValue('--viewport-background').trim() || '#000000');
    splash.remove();
    window.dispatchEvent(new Event('orbit:launched'));
  };
  const onTransitionEnd = (event: TransitionEvent) => { if (event.target === splash && event.propertyName === 'opacity') finish(); };
  const onPreference = () => { if (reduced.matches && fading) finish(); };
  reduced.addEventListener('change', onPreference);
  const fade = () => {
    if (disposed) return;
    fading = true;
    if (reduced.matches) { finish(); return; }
    html.dataset.launch = 'fading';
    let animated = false;
    if (typeof splash.animate === 'function' && typeof root.animate === 'function') {
      try {
        const options: KeyframeAnimationOptions = { duration: LAUNCH_FADE_MS, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' };
        const cover = preferHighRefresh(splash.animate([{ opacity: 1 }, { opacity: 0 }], options));
        animations.push(cover);
        const reveal = preferHighRefresh(root.animate([{ opacity: 0 }, { opacity: 1 }], options));
        animations.push(reveal);
        cover.onfinish = finish;
        animated = true;
      } catch {
        animations.forEach(animation => animation.cancel());
      }
    }
    if (!animated) {
      html.dataset.launch = 'leaving';
      splash.classList.add('is-leaving');
      splash.addEventListener('transitionend', onTransitionEnd);
    }
    finishTimer = setTimeout(finish, LAUNCH_FADE_MS + 50);
  };
  holdTimer = setTimeout(fade, Math.max(0, Math.ceil(LAUNCH_HOLD_MS - (performance.now() - startedAt))));
  return () => {
    disposed = true;
    clearTimeout(holdTimer);
    clearTimeout(finishTimer);
    reduced.removeEventListener('change', onPreference);
    splash.removeEventListener('transitionend', onTransitionEnd);
    animations.forEach(animation => { animation.onfinish = null; animation.cancel(); });
  };
}

export default function LaunchScreen() {
  useLayoutEffect(startLaunchScreen, []);
  return null;
}
