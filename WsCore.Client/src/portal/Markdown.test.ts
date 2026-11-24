import { describe, it, expect } from 'vitest';
import { parseInline, parseMarkdown } from './Markdown';

describe('Markdown', () => {
  it('splits paragraphs on blank lines and keeps line breaks inside one', () => {
    const blocks = parseMarkdown('First line\nsecond line\n\nNext');
    expect(blocks).toEqual([
      {
        kind: 'p',
        lines: [[{ kind: 'text', text: 'First line' }], [{ kind: 'text', text: 'second line' }]],
      },
      { kind: 'p', lines: [[{ kind: 'text', text: 'Next' }]] },
    ]);
  });

  it('reads headings and lists', () => {
    const blocks = parseMarkdown('## How to play\n- jump\n* shoot\nThen win');
    expect(blocks.map(b => b.kind)).toEqual(['h', 'ul', 'p']);
    expect(blocks[0]).toMatchObject({ level: 2 });
    expect(blocks[1]).toMatchObject({ items: [[{ text: 'jump' }], [{ text: 'shoot' }]] });
  });

  it('reads bold, italic, code and links; anything else is text', () => {
    expect(
      parseInline('**big** *small* `x=1` [site](https://example.com/a) and www.test.ru')
    ).toEqual([
      { kind: 'strong', text: 'big' },
      { kind: 'text', text: ' ' },
      { kind: 'em', text: 'small' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'x=1' },
      { kind: 'text', text: ' ' },
      { kind: 'link', text: 'site', href: 'https://example.com/a' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'www.test.ru', href: 'https://www.test.ru/' },
    ]);
    // Not a link scheme we open; HTML stays text.
    expect(parseInline('[x](javascript:alert(1)) <b>hi</b>')).toEqual([
      { kind: 'text', text: '[x](javascript:alert(1)) <b>hi</b>' },
    ]);
  });
});
