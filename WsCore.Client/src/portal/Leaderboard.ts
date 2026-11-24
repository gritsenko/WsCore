/**
 * Leaderboard answers as TOX handles them on their way to a game or the game page.
 *
 * The server sends avatar URLs as paths (`/avatars/3?v=9`): only the page knows where
 * the game server is (in dev not the page's own origin), and a game on the games origin
 * could not resolve a relative path against our server at all.
 */

/** Every `avatarUrl` that is a path, made absolute — anywhere in the answer. */
export function absolutizeAvatars(value: unknown, toUrl: (path: string) => string | null): unknown {
  if (Array.isArray(value)) return value.map(v => absolutizeAvatars(v, toUrl));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] =
      key === 'avatarUrl' && typeof v === 'string' && v.startsWith('/')
        ? toUrl(v)
        : absolutizeAvatars(v, toUrl);
  }
  return out;
}

/** The request arguments the server takes, from what the jam SDK's proxy sends per operation. */
export function sdkArgs(
  op: string,
  args: Record<string, unknown>
): { score?: number; extraData?: string; top?: number; around?: number; includeUser?: boolean } {
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  if (op === 'score')
    return {
      score: Math.floor(num(args.score, NaN)),
      extraData: args.extraData == null ? '' : String(args.extraData),
    };
  if (op === 'entries')
    return {
      top: Math.max(0, num(args.top, 10) | 0),
      around: Math.max(0, num(args.around, 3) | 0),
      includeUser: args.includeUser !== false,
    };
  return {};
}

/** One row of a board as the game page draws it (the jam / Yandex entry, as much as needed). */
export interface BoardRow {
  rank: number;
  formattedScore: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  own: boolean;
  isPlayer: boolean;
  hiddenFromOthers: boolean;
}

export interface BoardPanel {
  name: string;
  title: string;
  /** The stored title ('' = none: the technical name is shown). */
  titleRaw: string;
  invertSortOrder: boolean;
  scoreType: string;
  decimalOffset: number;
  entryCount: number;
  entries: BoardRow[];
  myRank: number;
  myEntry: BoardRow | null;
  ownCount: number;
}

/** The `boards` answer (the jam's panel payload), typed; anything malformed is skipped. */
export function parsePanel(value: unknown): BoardPanel[] {
  if (!Array.isArray(value)) return [];
  const row = (e: any): BoardRow | null =>
    e && typeof e === 'object'
      ? {
          rank: Number(e.rank) || 0,
          formattedScore: String(e.formattedScore ?? ''),
          name: String(e.name ?? ''),
          username: e.username ? String(e.username) : null,
          avatarUrl: e.avatarUrl ? String(e.avatarUrl) : null,
          own: !!e.own,
          isPlayer: !!e.isPlayer,
          hiddenFromOthers: !!e.hiddenFromOthers,
        }
      : null;
  return value.flatMap((b: any) => {
    const d = b?.description;
    if (!d || typeof d.name !== 'string') return [];
    return [
      {
        name: d.name,
        title: String(d.titleText ?? d.name),
        titleRaw: String(d.titleRaw ?? ''),
        invertSortOrder: !!d.description?.invert_sort_order,
        scoreType: String(d.description?.type ?? 'numeric'),
        decimalOffset: Number(d.description?.score_format?.options?.decimal_offset) || 0,
        entryCount: Number(d.entryCount) || 0,
        entries: (Array.isArray(b.entries) ? b.entries : []).map(row).filter(Boolean) as BoardRow[],
        myRank: Number(b.myRank) || 0,
        myEntry: row(b.myEntry),
        ownCount: Number(b.ownCount) || 0,
      },
    ];
  });
}

/**
 * The best (highest and lowest — the board's direction is not known here) score an
 * unnamed visitor made per game and board, kept for this browser session so it can be
 * sent once they enter: the server keeps whichever is better.
 */
export interface PendingScore {
  score: number;
  extraData: string;
}

export type PendingScores = Record<
  string,
  Record<string, { max: PendingScore; min: PendingScore }>
>;

export function addPending(
  all: PendingScores,
  gameId: string,
  board: string,
  s: PendingScore
): PendingScores {
  const game = { ...(all[gameId] ?? {}) };
  const cur = game[board];
  game[board] = cur
    ? { max: s.score > cur.max.score ? s : cur.max, min: s.score < cur.min.score ? s : cur.min }
    : { max: s, min: s };
  return { ...all, [gameId]: game };
}
