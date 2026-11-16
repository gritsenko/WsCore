import { describe, expect, it } from 'vitest';
import { linkify, toHref } from './Linkify';

const links = (text: string) => linkify(text).filter(p => p.href);

describe('linkify', () => {
  it('leaves plain text alone', () => {
    expect(linkify('просто текст. без ссылок')).toEqual([{ text: 'просто текст. без ссылок' }]);
  });

  it('finds http(s) links with paths and queries', () => {
    expect(linkify('см. https://example.com/a?b=1#c тут')).toEqual([
      { text: 'см. ' },
      { text: 'https://example.com/a?b=1#c', href: 'https://example.com/a?b=1#c' },
      { text: ' тут' },
    ]);
  });

  it('adds https to www. and bare domains', () => {
    expect(links('www.example.org и github.com/foo')).toEqual([
      { text: 'www.example.org', href: 'https://www.example.org/' },
      { text: 'github.com/foo', href: 'https://github.com/foo' },
    ]);
  });

  it('drops sentence punctuation but keeps balanced brackets', () => {
    expect(links('Читай example.com.')[0].text).toBe('example.com');
    expect(links('(см. https://a.io/x)')[0].text).toBe('https://a.io/x');
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar).')[0].text).toBe(
      'https://en.wikipedia.org/wiki/Foo_(bar)'
    );
  });

  it('ignores e-mails, unknown TLDs and non-http schemes', () => {
    expect(links('me@example.com file.txt javascript:alert(1) a.b')).toEqual([]);
  });

  it('keeps the text intact when joined back', () => {
    const text = 'a https://x.io/1, b www.y.com; c';
    expect(
      linkify(text)
        .map(p => p.text)
        .join('')
    ).toBe(text);
  });
});

describe('toHref', () => {
  it('accepts only http(s)', () => {
    expect(toHref('http://x.com')).toBe('http://x.com/');
    expect(toHref('https://')).toBeNull();
  });
});
