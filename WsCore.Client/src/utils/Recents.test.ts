import { describe, it, expect } from 'vitest';
import Recents from './Recents';

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('Recents', () => {
  it('keeps the most recent first, without repeats, up to the limit, across pages', () => {
    const store = memory();
    const recents = new Recents('k', 3, store);
    for (const v of ['a', 'b', 'c', 'a', 'd']) recents.push(v);
    expect(recents.list).toEqual(['d', 'a', 'c']);
    expect(new Recents('k', 3, store).list).toEqual(['d', 'a', 'c']);
  });

  it('survives garbage and a throwing storage', () => {
    expect(new Recents('k', 3, memory({ k: '{oops' })).list).toEqual([]);
    expect(new Recents('k', 3, memory({ k: '[1,"x",null]' })).list).toEqual(['x']);
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const recents = new Recents('k', 3, broken);
    recents.push('a');
    expect(recents.list).toEqual(['a']);
  });
});
