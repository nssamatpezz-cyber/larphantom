import { useLayoutEffect } from 'react';

/** iOS standalone can report a shorter CSS dvh than its usable layout viewport. */
export function useAppViewport() {
  useLayoutEffect(() => {
    let frame: number | undefined;
    const root = document.documentElement;
    const update = () => {
      frame = undefined;
      const height = window.innerHeight;
      if (Number.isFinite(height) && height > 0) {
        const value = `${height}px`;
        if (root.style.getPropertyValue('--app-viewport-height') !== value) root.style.setProperty('--app-viewport-height', value);
      }
    };
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', schedule);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('pageshow', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, []);
}
