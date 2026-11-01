import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { preferHighRefresh, settleSheetFrames } from './motion';

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
const originalTimeline = Object.getOwnPropertyDescriptor(document, 'timeline');
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false })) });
  Object.defineProperty(document, 'timeline', { configurable: true, value: {} });
});
afterEach(() => {
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
  if (originalTimeline) Object.defineProperty(document, 'timeline', originalTimeline);
  else Reflect.deleteProperty(document, 'timeline');
});

describe('progressive animation cadence', () => {
  it('does not invent a frameRate API on an unsupported animation', () => {
    const animation = {} as Animation;
    expect(preferHighRefresh(animation)).toBe(animation);
    expect('frameRate' in animation).toBe(false);
  });
  it('requests up to 120 only on an exposed API and respects a reported display ceiling', () => {
    const animation = { frameRate: 60 } as unknown as Animation & { frameRate: number };
    preferHighRefresh(animation); expect(animation.frameRate).toBe(120);
    Object.defineProperty(document, 'timeline', { configurable: true, value: { maximumFrameRate: 90 } });
    preferHighRefresh(animation); expect(animation.frameRate).toBe(90);
  });
  it('does not override Reduce Motion or fail on a read-only implementation', () => {
    const animation = { frameRate: 60 } as unknown as Animation & { frameRate: number };
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: true })) });
    preferHighRefresh(animation); expect(animation.frameRate).toBe(60);
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false })) });
    expect(() => preferHighRefresh(Object.freeze(animation))).not.toThrow();
    expect(animation.frameRate).toBe(60);
  });
});

describe('time-based sheet spring', () => {
  it('starts at the drag distance and settles at the unchanged resting position', () => {
    const frames = settleSheetFrames(60, .25);
    expect(frames[0]).toMatchObject({ offset: 0, transform: 'translate3d(0,60px,0)' });
    expect(frames[frames.length - 1]).toMatchObject({ offset: 1, transform: 'translate3d(0,0px,0)' });
    expect(frames.every(frame => !String(frame.transform).includes('NaN'))).toBe(true);
  });
  it('accounts for release velocity and leaves a stationary sheet stationary', () => {
    const position = (frame: Keyframe) => Number(String(frame.transform).match(/,([^p]+)px/)?.[1]);
    expect(position(settleSheetFrames(60, .5)[1])).toBeGreaterThan(position(settleSheetFrames(60, -.5)[1]));
    expect(settleSheetFrames(0, 0).every(frame => position(frame) === 0)).toBe(true);
  });
});
