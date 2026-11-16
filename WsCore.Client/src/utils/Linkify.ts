/** A piece of a chat message: plain text, or a link with the URL it opens. */
export type TextPart = { text: string; href?: undefined } | { text: string; href: string };

// Same shapes the server treats as links (ModerationService.LinkPattern): a scheme,
// "www.", or a bare domain on a common TLD — each with whatever path follows it.
const LINK =
  /(?:\bhttps?:\/\/|\bwww\.|(?<![\p{L}\d@.-])[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.(?:com|net|org|ru|su|рф|io|me|gg|tv|xyz|dev|app|info|co|ly|ua|by|kz)(?![\p{L}\d-]))[^\s<>"]*/giu;

// Punctuation that ends a sentence rather than the URL ("see example.com.").
const TRAILING = /[.,!?;:'"»)\]}]+$/u;

/** The URL a link opens, or null if it is not an http(s) URL with a host. */
export function toHref(text: string): string | null {
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Split a message into text and links. Only http(s) links are produced. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    let raw = match[0];
    // Keep a closing bracket that belongs to the URL ("…/Foo_(bar)").
    const trailing = TRAILING.exec(raw)?.[0] ?? '';
    if (trailing) {
      let keep = 0;
      for (const ch of trailing) {
        const open = ch === ')' ? '(' : ch === ']' ? '[' : null;
        const body = raw.slice(0, raw.length - trailing.length + keep);
        if (open && body.split(open).length > body.split(ch).length) keep++;
        else break;
      }
      raw = raw.slice(0, raw.length - trailing.length + keep);
    }
    const href = toHref(raw);
    if (!href || /^https?:\/\/?$/i.test(raw)) continue;
    const start = match.index;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
