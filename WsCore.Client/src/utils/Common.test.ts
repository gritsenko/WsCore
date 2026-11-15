import { describe, it, expect } from 'vitest';
import {
  advanceFrame,
  frameDeltaSeconds,
  lerp,
  MAX_FRAME_DT,
  rateFromPerFrameLerp,
  smoothingFactor,
} from './Common';

describe('smoothingFactor', () => {
  const k = rateFromPerFrameLerp(0.09, 60);

  it('matches the legacy per-frame lerp(…, 0.09) at 60 Hz', () => {
    expect(smoothingFactor(k, 1 / 60)).toBeCloseTo(0.09, 10);
  });

  it('converges at the same wall-clock rate at 60 Hz and 144 Hz', () => {
    const run = (hz: number, seconds: number) => {
      let v = 0;
      const dt = 1 / hz;
      for (let i = 0; i < Math.round(seconds * hz); i++) v = lerp(v, 100, smoothingFactor(k, dt));
      return v;
    };
    expect(run(144, 0.5)).toBeCloseTo(run(60, 0.5), 6);
  });

  it('is 0 for non-positive dt and stays within [0, 1)', () => {
    expect(smoothingFactor(k, 0)).toBe(0);
    expect(smoothingFactor(k, -1)).toBe(0);
    const big = smoothingFactor(k, 10);
    expect(big).toBeGreaterThan(0.99);
    expect(big).toBeLessThanOrEqual(1);
  });
});

describe('frameDeltaSeconds', () => {
  it('converts ms to seconds', () => {
    expect(frameDeltaSeconds(1016, 1000)).toBeCloseTo(0.016, 10);
  });

  it('clamps long gaps (backgrounded tab) and negative deltas', () => {
    expect(frameDeltaSeconds(10_000, 0)).toBe(MAX_FRAME_DT);
    expect(frameDeltaSeconds(1000, 2000)).toBe(0);
    expect(frameDeltaSeconds(NaN, 0)).toBe(0);
  });
});

describe('advanceFrame', () => {
  it('advances at `fps` frames per second regardless of refresh rate', () => {
    const run = (hz: number) => {
      let s = { frame: 0, accumulator: 0 };
      for (let i = 0; i < hz; i++) s = advanceFrame(s.frame, s.accumulator, 1 / hz, 8, 100);
      return s.frame;
    };
    expect(run(60)).toBe(8);
    expect(run(144)).toBe(8);
  });

  it('carries the remainder and wraps around frameCount', () => {
    const a = advanceFrame(0, 0, 0.1, 8, 12); // 0.8 frames
    expect(a.frame).toBe(0);
    expect(a.accumulator).toBeCloseTo(0.1, 10);
    const b = advanceFrame(a.frame, a.accumulator, 0.05, 8, 12); // 1.2 frames total
    expect(b.frame).toBe(1);
    expect(advanceFrame(11, 0, 0.125, 8, 12).frame).toBe(0);
  });

  it('handles an empty sheet', () => {
    expect(advanceFrame(3, 0.5, 1, 8, 0)).toEqual({ frame: 0, accumulator: 0 });
  });
});
