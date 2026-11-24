/**
 * The games portal's numbers as the analytics screens draw them — the shape of
 * `GET /api/games/{id}/stats` and `/api/games/stats`, and the pure arithmetic around it
 * (every day of the period, axis ticks, Russian number and duration formats).
 */

export interface StatsDay {
  day: string; // yyyy-mm-dd (UTC)
  views: number;
  launches: number;
  plays: number;
  activeMs: number;
  players: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface GameRow {
  gameId: string;
  title: string;
  slug: string;
  views: number;
  launches: number;
  plays: number;
  activeMs: number;
  players: number;
}

export interface GameStats {
  gameId: string | null;
  days: number;
  totals: { views: number; launches: number; plays: number; activeMs: number } | null;
  sessions: {
    sessions: number;
    medianMs: number;
    longestMs: number;
    atLeast1Min: number;
    atLeast3Min: number;
    atLeast10Min: number;
  };
  players: number;
  returningPlayers: number;
  daily: StatsDay[];
  events: NamedCount[];
  levels: NamedCount[];
  sources: NamedCount[];
  games: GameRow[];
}

/** Every day of the last `days` (ending `today`), zeros where nothing happened — a line never skips a day. */
export function fillDays(daily: StatsDay[], days: number, today: Date): StatsDay[] {
  const byDay = new Map(daily.map(d => [d.day, d]));
  const out: StatsDay[] = [];
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, views: 0, launches: 0, plays: 0, activeMs: 0, players: 0 });
  }
  return out;
}

/** Sums of a period's days. */
export function sumDays(days: StatsDay[]): {
  views: number;
  launches: number;
  plays: number;
  activeMs: number;
} {
  return days.reduce(
    (s, d) => ({
      views: s.views + d.views,
      launches: s.launches + d.launches,
      plays: s.plays + d.plays,
      activeMs: s.activeMs + d.activeMs,
    }),
    { views: 0, launches: 0, plays: 0, activeMs: 0 }
  );
}

/** Round axis ticks from 0 to at least `max` (1/2/5 × 10^n steps, about `count` of them). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * magnitude).find(s => s >= raw) ?? 10 * magnitude;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** 1 284 · 12,9 тыс. · 4,2 млн. */
export function compact(n: number): string {
  const abs = Math.abs(n);
  const short = (v: number, unit: string) =>
    `${(Math.round(v * 10) / 10).toString().replace('.', ',')} ${unit}`;
  if (abs >= 1_000_000) return short(n / 1_000_000, 'млн');
  if (abs >= 10_000) return short(n / 1000, 'тыс.');
  return Math.round(n).toLocaleString('ru-RU');
}

/** 0:42 · 3:07 · 1 ч 05 мин · 12 ч. */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h >= 10 ? `${h} ч` : `${h} ч ${String(m).padStart(2, '0')} мин`;
}

/** A share as a whole percent ("—" when there is nothing to share). */
export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

/** 24 нояб. */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Reads the API's JSON into the typed shape (missing parts as empty). */
export function parseStats(json: any): GameStats {
  const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    gameId: json?.gameId ?? null,
    days: Number(json?.days) || 30,
    totals: json?.totals ?? null,
    sessions: json?.sessions ?? {
      sessions: 0,
      medianMs: 0,
      longestMs: 0,
      atLeast1Min: 0,
      atLeast3Min: 0,
      atLeast10Min: 0,
    },
    players: Number(json?.players) || 0,
    returningPlayers: Number(json?.returningPlayers) || 0,
    daily: list<StatsDay>(json?.daily),
    events: list<NamedCount>(json?.events),
    levels: list<NamedCount>(json?.levels),
    sources: list<NamedCount>(json?.sources),
    games: list<GameRow>(json?.games),
  };
}

/** How a view source reads. */
export const SOURCE_NAMES: Record<string, string> = {
  catalog: 'Каталог',
  link: 'Прямая ссылка',
  nav: 'Назад / вперёд',
  chat: 'Чат',
  room: 'Комната',
  other: 'Другое',
};
