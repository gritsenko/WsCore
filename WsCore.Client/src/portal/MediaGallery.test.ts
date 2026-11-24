import { describe, it, expect } from 'vitest';
import { mediaItems, swipeStep, wrapIndex } from './MediaGallery';

describe('mediaItems', () => {
  it('puts the cover first, then the screenshots in order', () => {
    const items = mediaItems({
      title: 'Игра',
      coverUrl: '/c.jpg',
      screenshots: ['/a.jpg', '/b.jpg'],
    });
    expect(items.map(i => [i.kind, i.url])).toEqual([
      ['cover', '/c.jpg'],
      ['shot', '/a.jpg'],
      ['shot', '/b.jpg'],
    ]);
    expect(items[2].alt).toBe('Игра — скриншот 2');
  });

  it('has only the screenshots without a cover', () => {
    expect(mediaItems({ title: 'x', coverUrl: null, screenshots: ['/a.jpg'] })).toHaveLength(1);
  });
});

describe('wrapIndex', () => {
  it('goes round at both ends', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(7, 3)).toBe(1);
    expect(wrapIndex(5, 0)).toBe(0);
  });
});

describe('swipeStep', () => {
  it('a left swipe goes forward, a right one back', () => {
    expect(swipeStep(-80, 5)).toBe(1);
    expect(swipeStep(80, -5)).toBe(-1);
  });

  it('ignores short or mostly vertical drags', () => {
    expect(swipeStep(-20, 0)).toBe(0);
    expect(swipeStep(-60, 70)).toBe(0);
  });
});
