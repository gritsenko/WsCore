import { describe, it, expect } from 'vitest';
import {
  ART_ID_PATTERN,
  ART_MAX_COLS,
  ART_MAX_ROWS,
  allArts,
  artById,
  artCategories,
  artLabel,
  entryText,
  pickerArts,
  searchArts,
} from './AsciiArt';
import { KAOMOJI } from './kaomoji';

// The catalog is generated (tools/ascii-art/build.mjs); this is its validator — a
// broken entry would break messages that refer to it, or the history's scroll math.
describe('ASCII-art catalog', () => {
  const arts = allArts();

  it('has unique, well-formed ids (the server accepts the same shape)', () => {
    const ids = arts.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(ART_ID_PATTERN);
  });

  it('every picture fits the limits and its cols / rows describe its lines', () => {
    for (const a of arts) {
      expect(a.lines.length, a.id).toBe(a.rows);
      expect(Math.max(...a.lines.map(l => l.length)), a.id).toBe(a.cols);
      expect(a.cols, a.id).toBeLessThanOrEqual(ART_MAX_COLS);
      expect(a.rows, a.id).toBeLessThanOrEqual(ART_MAX_ROWS);
      for (const line of a.lines) expect(line, a.id).toMatch(/^[\x20-\x7e]*$/);
      // Normalized: nothing to trim around it.
      expect(a.lines[0].trim(), a.id).not.toBe('');
      expect(a.lines[a.rows - 1].trim(), a.id).not.toBe('');
      expect(
        a.lines.some(l => !l.startsWith(' ')),
        a.id
      ).toBe(true);
      expect(
        a.lines.every(l => l === l.trimEnd()),
        a.id
      ).toBe(true);
    }
  });

  it('every art has a title, a category and tags to be found by', () => {
    for (const a of arts) {
      expect(a.title, a.id).toBeTruthy();
      expect(a.category, a.id).toBeTruthy();
      expect(a.tags.length, a.id).toBeGreaterThan(0);
    }
    expect(pickerArts().length).toBeGreaterThanOrEqual(50);
    expect(artCategories().length).toBeGreaterThan(3);
  });

  it('search matches every word against title, tags and category, ё as е', () => {
    expect(searchArts('кот').map(a => a.id)).toContain('cat-01');
    expect(searchArts('КОТ спать').map(a => a.id)).toEqual(['cat-02']);
    expect(searchArts('елка').map(a => a.id)).toEqual(['tree-01']);
    expect(searchArts('gg').map(a => a.id)).toContain('banner-gg');
    expect(searchArts('нет такого слова')).toEqual([]);
    expect(searchArts('  ').length).toBe(pickerArts().length);
  });

  it('an unknown id has no picture but still reads as a label', () => {
    expect(artById('no-such-art')).toBeUndefined();
    expect(artLabel('no-such-art')).toBe('[арт: no-such-art]');
    expect(artLabel('cat-01')).toBe('[арт: Кот]');
    expect(entryText({ text: '', artId: 'cat-01' })).toBe('[арт: Кот]');
    expect(entryText({ text: 'hi' })).toBe('hi');
  });
});

describe('kaomoji', () => {
  it('has no duplicates, nothing empty, nothing a chat message would cut', () => {
    const all = KAOMOJI.flatMap(c => c.items);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBeGreaterThanOrEqual(200);
    for (const k of all) {
      expect(k.trim()).toBe(k);
      expect(k.length).toBeGreaterThan(0);
      expect(k.length).toBeLessThanOrEqual(48);
      // eslint-disable-next-line no-control-regex
      expect(k).not.toMatch(/[\u0000-\u001f\u007f]/);
    }
    expect(new Set(KAOMOJI.map(c => c.id)).size).toBe(KAOMOJI.length);
  });
});
