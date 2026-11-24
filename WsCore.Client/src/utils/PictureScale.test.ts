import { describe, it, expect } from 'vitest';
import { fitWithin } from './PictureScale';

describe('fitWithin', () => {
  it('scales down keeping the shape, never up', () => {
    expect(fitWithin(4000, 3000, 1200, 1200)).toEqual({ width: 1200, height: 900 });
    expect(fitWithin(1000, 3000, 1920, 1080)).toEqual({ width: 360, height: 1080 });
    expect(fitWithin(800, 600, 1200, 1200)).toEqual({ width: 800, height: 600 });
  });
});
