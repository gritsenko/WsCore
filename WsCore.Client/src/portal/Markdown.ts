import { linkify } from '../utils/Linkify';

/**
 * The little Markdown a game's description and release notes use, rendered as DOM nodes
 * (never as HTML — the text is somebody else's): paragraphs, `#`–`###` headings, `-` / `*`
 * lists, **bold**, *italic*, `code`, and http(s) links (bare, or `[text](url)`).
 * Anything else stays text.
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em' | 'code'; text: string }
  | { kind: 'link'; text: string; href: string };

export type Block =
  | { kind: 'p'; lines: Inline[][] }
  | { kind: 'h'; level: 1 | 2 | 3; content: Inline[] }
  | { kind: 'ul'; items: Inline[][] };

const INLINE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pushText = (s: string) => {
    for (const part of linkify(s)) {
      if (part.href) out.push({ kind: 'link', text: part.text, href: part.href });
      else if (part.text) out.push({ kind: 'text', text: part.text });
    }
  };
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) pushText(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ kind: 'strong', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'em', text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: 'code', text: m[3] });
    else out.push({ kind: 'link', text: m[4], href: new URL(m[5]).href });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(text.slice(last));
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: Inline[][] | null = null;
  let list: Inline[][] | null = null;
  const flush = () => {
    if (paragraph) blocks.push({ kind: 'p', lines: paragraph });
    if (list) blocks.push({ kind: 'ul', items: list });
    paragraph = null;
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({
        kind: 'h',
        level: heading[1].length as 1 | 2 | 3,
        content: parseInline(heading[2]),
      });
      continue;
    }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (item) {
      if (paragraph) flush();
      (list ??= []).push(parseInline(item[1]));
      continue;
    }
    if (list) flush();
    (paragraph ??= []).push(parseInline(line.trim()));
  }
  flush();
  return blocks;
}

function renderInline(parts: Inline[], parent: HTMLElement): void {
  for (const part of parts) {
    if (part.kind === 'text') {
      parent.appendChild(document.createTextNode(part.text));
    } else if (part.kind === 'link') {
      const a = document.createElement('a');
      a.href = part.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      a.textContent = part.text;
      parent.appendChild(a);
    } else {
      const el = document.createElement(part.kind);
      el.textContent = part.text;
      parent.appendChild(el);
    }
  }
}

/** The Markdown as a fragment of DOM nodes (text only — no HTML from the source). */
export function renderMarkdown(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const block of parseMarkdown(source)) {
    if (block.kind === 'p') {
      const p = document.createElement('p');
      block.lines.forEach((line, i) => {
        if (i > 0) p.appendChild(document.createElement('br'));
        renderInline(line, p);
      });
      fragment.appendChild(p);
    } else if (block.kind === 'h') {
      const h = document.createElement(`h${block.level + 2}`); // h3–h5 inside the page
      renderInline(block.content, h);
      fragment.appendChild(h);
    } else {
      const ul = document.createElement('ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        renderInline(item, li);
        ul.appendChild(li);
      }
      fragment.appendChild(ul);
    }
  }
  return fragment;
}
