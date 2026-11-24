import catalog from './asciiArt.json';

/**
 * The chat's ASCII-art catalog. A message carries only an art's id (like a sticker);
 * the pictures are bundled with the client, so the height of a message is known when
 * it is drawn (scroll correction while older history pages load depends on that).
 *
 * Built from `tools/ascii-art/art.txt` by `tools/ascii-art/build.mjs`. Ids are never
 * removed or reused — an art taken out of the picker stays here as `hidden`, so old
 * messages keep their picture.
 */
export interface AsciiArt {
  id: string;
  title: string;
  tags: string[];
  category: string;
  /** Width in characters (the longest line). */
  cols: number;
  rows: number;
  lines: string[];
  /** Kept for old messages, not offered in the picker. */
  hidden?: boolean;
}

/** Same rule as the server's (`ChatMessageRequestHandler`). */
export const ART_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
export const ART_MAX_COLS = 48;
export const ART_MAX_ROWS = 24;

const ARTS: readonly AsciiArt[] = catalog as AsciiArt[];
const BY_ID = new Map(ARTS.map(a => [a.id, a]));

/** The art for a message; undefined = not in this client's catalog (drawn as unavailable). */
export function artById(id: string): AsciiArt | undefined {
  return BY_ID.get(id);
}

/** Everything the picker may offer, in catalog order. */
export function pickerArts(): AsciiArt[] {
  return ARTS.filter(a => !a.hidden);
}

/** The picker's categories, in the order they first appear. */
export function artCategories(): string[] {
  return [...new Set(pickerArts().map(a => a.category))];
}

/** Arts whose title, tags or category contain every word of the query. */
export function searchArts(query: string, arts: readonly AsciiArt[] = pickerArts()): AsciiArt[] {
  const words = query.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
  if (!words.length) return [...arts];
  return arts.filter(a => {
    const hay = [a.title, a.category, ...a.tags].join(' ').toLowerCase().replace(/ё/g, 'е');
    return words.every(w => hay.includes(w));
  });
}

/** How a message with this art reads as text: the chat search, the in-game overlay. */
export function artLabel(id: string): string {
  return `[арт: ${artById(id)?.title ?? id}]`;
}

/** A chat entry as one line of text (an art by its label). */
export function entryText(entry: { text: string; artId?: string }): string {
  return entry.artId ? artLabel(entry.artId) : entry.text;
}

/** The whole catalog (tests). */
export function allArts(): readonly AsciiArt[] {
  return ARTS;
}
