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

/** Analytic damped spring, sampled for the compositor rather than a React frame loop. */
export function settleSheetFrames(distance: number, velocity: number): Keyframe[] {
  const duration = .42;
  const frequency = Math.sqrt(470);
  const decay = 18;
  const damped = Math.sqrt(frequency * frequency - decay * decay);
  const amplitude = (velocity * 1000 + decay * distance) / damped;
  return Array.from({ length: 29 }, (_, index) => {
    const progress = index / 28;
    const time = progress * duration;
    const position = index === 28 ? 0 : Math.exp(-decay * time) * (distance * Math.cos(damped * time) + amplitude * Math.sin(damped * time));
    return { offset: progress, transform: `translate3d(0,${position}px,0)` };
  });
}
