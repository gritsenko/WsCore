import { describe, it, expect } from 'vitest';
import { CLICK_MAX_DISTANCE_PX, CLICK_MAX_DURATION_MS, isClickGesture } from './Pointer';

describe('isClickGesture', () => {
  const down = { x: 100, y: 100, t: 1000 };

  it('treats a short, stationary press as a click', () => {
    expect(isClickGesture(down, { x: 101, y: 99, t: 1080 })).toBe(true);
  });

  it('accepts movement exactly at the distance threshold', () => {
    expect(isClickGesture(down, { x: 100 + CLICK_MAX_DISTANCE_PX, y: 100, t: 1050 })).toBe(true);
  });

  it('treats movement beyond the threshold as a camera drag', () => {
    expect(isClickGesture(down, { x: 140, y: 120, t: 1100 })).toBe(false);
    expect(isClickGesture(down, { x: 104, y: 104, t: 1100 })).toBe(false); // ~5.66px
  });

  it('treats a long press as a drag/hold even without movement', () => {
    expect(isClickGesture(down, { x: 100, y: 100, t: 1000 + CLICK_MAX_DURATION_MS + 1 })).toBe(
      false
    );
  });
});
