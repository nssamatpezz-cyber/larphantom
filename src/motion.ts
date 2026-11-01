import { useSyncExternalStore } from 'react';

let motionPreference: MediaQueryList | undefined;
function preference() {
  if (typeof window === 'undefined' || !window.matchMedia) return undefined;
  return motionPreference ??= window.matchMedia('(prefers-reduced-motion: reduce)');
}
function subscribe(listener: () => void) {
  const query = preference();
  query?.addEventListener('change', listener);
  return () => query?.removeEventListener('change', listener);
}
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => preference()?.matches ?? false, () => false);
}

/** Progressive WebKit hint, not a guarantee or an artificial rendering loop. */
export function preferHighRefresh<T extends Animation>(animation: T): T {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return animation;
  if (!('frameRate' in animation)) return animation;
  try {
    const maximum = typeof document !== 'undefined'
      ? (document.timeline as DocumentTimeline & { maximumFrameRate?: number | null } | undefined)?.maximumFrameRate
      : undefined;
    (animation as Animation & { frameRate: number }).frameRate = typeof maximum === 'number' && maximum > 0 ? Math.min(120, maximum) : 120;
  } catch { /* Unsupported, read-only or power-limited implementations keep native cadence. */ }
  return animation;
}

/** Analytic damped spring, sampled for the compositor rather than a React frame loop. */
export function settleSheetFrames(distance: number, velocity: number): Keyframe[] {
  const duration = .42;
  const frequency = Math.sqrt(470);
  const decay = 18;
  const damped = Math.sqrt(frequency * frequency - decay * decay);
  const amplitude = (velocity * 1000 + decay * distance) / damped;
  // These are curve samples, not display frames; the compositor interpolates them.
  const samples = 65;
  return Array.from({ length: samples }, (_, index) => {
    const progress = index / (samples - 1);
    const time = progress * duration;
    const position = index === samples - 1 ? 0 : Math.exp(-decay * time) * (distance * Math.cos(damped * time) + amplitude * Math.sin(damped * time));
    return { offset: progress, transform: `translate3d(0,${position}px,0)` };
  });
}
