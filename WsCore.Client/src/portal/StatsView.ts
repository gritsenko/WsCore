import { barChart, barList, lineChart } from './Charts';
import { countOf, plays } from './PortalUI';
import {
  compact,
  duration,
  fillDays,
  percent,
  shortDay,
  SOURCE_NAMES,
  sumDays,
  type GameStats,
} from './Stats';

/** Categorical slots 1–3 (validated on the dark surface) and the sequential blue. */
const C1 = 'var(--series-1)';
const C2 = 'var(--series-2)';
const C3 = 'var(--series-3)';

const PERIODS = [7, 30, 90];

export interface StatsViewOptions {
  /** A game's numbers, or the whole portal's (with its table of games). */
  scope: 'game' | 'portal';
  load(days: number): Promise<GameStats>;
  onOpenGame?(slug: string): void;
  /** Today (tests pin it). */
  now?: () => Date;
}

function div(className: string, text?: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  if (text !== undefined) d.textContent = text;
  return d;
}

function tile(label: string, value: string, note?: string): HTMLDivElement {
  const t = div('stats-tile');
  t.append(div('stats-tile-label', label), div('stats-tile-value', value));
  if (note) t.appendChild(div('stats-tile-note', note));
  return t;
}

/**
 * The analytics panel: a period row on top (7 / 30 / 90 days, scoping everything below),
 * stat tiles, the per-day charts, the breakdowns and a table view. A reload keeps the
 * previous render, dimmed — no skeleton, no jump.
 */
export default class StatsView {
  readonly element: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly periods: HTMLButtonElement[] = [];
  private days = 30;
  private seq = 0;

  constructor(private readonly options: StatsViewOptions) {
    this.element = div('portal-stats');
    const head = div('stats-head');
    head.appendChild(
      div('stats-title', options.scope === 'game' ? 'Аналитика' : 'Статистика раздела')
    );
    const filters = div('stats-periods');
    for (const days of PERIODS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stats-period';
      b.textContent = `${days} дней`;
      b.onclick = () => void this.refresh(days);
      filters.appendChild(b);
      this.periods.push(b);
    }
    head.appendChild(filters);
    this.element.appendChild(head);
    this.element.appendChild(
      div(
        'stats-hint',
        'Только аудитория: авторы игры и администраторы не учитываются. Партия — от 15 секунд игры.'
      )
    );
    this.body = div('stats-body');
    this.body.appendChild(div('stats-loading', 'Загружаю…'));
    this.element.appendChild(this.body);
    void this.refresh(this.days);
  }

  async refresh(days = this.days): Promise<void> {
    this.days = days;
    this.periods.forEach((b, i) => b.setAttribute('aria-pressed', String(PERIODS[i] === days)));
    const seq = ++this.seq;
    this.body.classList.add('stats-reloading');
    try {
      const stats = await this.options.load(days);
      if (seq !== this.seq) return;
      this.render(stats);
    } catch (e) {
      if (seq !== this.seq) return;
      this.body.replaceChildren(
        div('stats-loading', e instanceof Error ? e.message : 'Не удалось загрузить')
      );
    } finally {
      if (seq === this.seq) this.body.classList.remove('stats-reloading');
    }
  }

  private render(stats: GameStats): void {
    const days = fillDays(stats.daily, this.days, this.options.now?.() ?? new Date());
    const sum = sumDays(days);
    const labels = days.map(d => shortDay(d.day));
    const s = stats.sessions;
    const parts: HTMLElement[] = [];

    const tiles = div('stats-tiles');
    tiles.append(
      tile('Игроки', compact(stats.players), `вернулись: ${compact(stats.returningPlayers)}`),
      tile('Партии', compact(sum.plays), `из ${compact(sum.launches)} запусков`),
      tile('Просмотры', compact(sum.views), `в партию: ${percent(sum.plays, sum.views)}`),
      tile('Время в игре', duration(sum.activeMs))
    );
    if (this.options.scope === 'game') {
      tiles.append(
        tile('Медиана партии', duration(s.medianMs), `дольше всех: ${duration(s.longestMs)}`),
        tile(
          'Дольше 3 минут',
          percent(s.atLeast3Min, s.sessions),
          `≥ 1 мин: ${percent(s.atLeast1Min, s.sessions)} · ≥ 10 мин: ${percent(s.atLeast10Min, s.sessions)}`
        )
      );
    }
    parts.push(tiles);
    if (stats.totals)
      parts.push(
        div(
          'stats-hint',
          `За всё время: ${countOf(stats.totals.views, 'просмотр', 'просмотра', 'просмотров')} · ${countOf(stats.totals.launches, 'запуск', 'запуска', 'запусков')} · ${plays(stats.totals.plays)} · ${duration(stats.totals.activeMs)} в игре`
        )
      );

    parts.push(
      lineChart(
        'По дням',
        labels,
        [
          { name: 'Просмотры', color: C1, values: days.map(d => d.views) },
          { name: 'Запуски', color: C2, values: days.map(d => d.launches) },
          { name: 'Партии', color: C3, values: days.map(d => d.plays) },
        ],
        compact
      )
    );
    if (this.options.scope === 'portal')
      parts.push(
        lineChart(
          'Игроки по дням',
          labels,
          [{ name: 'Игроки', color: C1, values: days.map(d => d.players) }],
          compact
        )
      );
    parts.push(
      barChart(
        'Время в игре по дням, минут',
        labels,
        days.map(d => Math.round(d.activeMs / 60_000)),
        C1,
        compact
      )
    );

    const grid = div('stats-grid');
    if (this.options.scope === 'game') {
      const first = stats.levels[0]?.count ?? 0;
      grid.appendChild(
        barList(
          'Уровни: сколько партий дошли',
          stats.levels.map(l => ({
            name: `Уровень ${l.name}`,
            value: l.count,
            note: percent(l.count, first),
          })),
          C1,
          compact,
          'Игра не сообщает уровни (Jam.levelComplete).'
        )
      );
      grid.appendChild(
        barList(
          'События игры',
          stats.events.map(e => ({ name: e.name, value: e.count })),
          C1,
          compact,
          'Игра не шлёт событий (Jam.logEvent).'
        )
      );
    }
    grid.appendChild(
      barList(
        'Откуда открывают страницу',
        stats.sources.map(x => ({
          name: SOURCE_NAMES[x.name] ?? x.name,
          value: x.count,
        })),
        C1,
        compact,
        'Пока никто.'
      )
    );
    parts.push(grid);

    if (this.options.scope === 'portal') parts.push(this.gamesTable(stats));
    parts.push(this.dayTable(days));
    this.body.replaceChildren(...parts);
  }

  private gamesTable(stats: GameStats): HTMLElement {
    const box = div('chart-card');
    box.appendChild(div('chart-title', 'Игры за период'));
    if (stats.games.length === 0) {
      box.appendChild(div('chart-empty', 'Пока ни одной партии.'));
      return box;
    }
    const table = document.createElement('table');
    table.className = 'stats-table';
    const head = table.createTHead().insertRow();
    for (const h of [
      'Игра',
      'Игроки',
      'Партии',
      'Запуски',
      'Просмотры',
      'Просмотр → партия',
      'Время',
    ]) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const g of stats.games) {
      const row = body.insertRow();
      const name = row.insertCell();
      const link = document.createElement('a');
      link.href = `/games/${g.slug}`;
      link.textContent = g.title;
      link.onclick = e => {
        if (!this.options.onOpenGame || e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        this.options.onOpenGame(g.slug);
      };
      name.appendChild(link);
      for (const v of [
        compact(g.players),
        compact(g.plays),
        compact(g.launches),
        compact(g.views),
        percent(g.plays, g.views),
        duration(g.activeMs),
      ])
        row.insertCell().textContent = v;
    }
    box.appendChild(table);
    return box;
  }

  /** The table view: every number of the charts, without hovering. */
  private dayTable(days: ReturnType<typeof fillDays>): HTMLElement {
    const details = document.createElement('details');
    details.className = 'chart-card stats-days';
    const summary = document.createElement('summary');
    summary.textContent = 'Таблица по дням';
    details.appendChild(summary);
    const table = document.createElement('table');
    table.className = 'stats-table';
    const head = table.createTHead().insertRow();
    for (const h of ['День', 'Просмотры', 'Запуски', 'Партии', 'Игроки', 'Время']) {
      const th = document.createElement('th');
      th.textContent = h;
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const d of [...days].reverse()) {
      const row = body.insertRow();
      for (const v of [
        shortDay(d.day),
        compact(d.views),
        compact(d.launches),
        compact(d.plays),
        compact(d.players),
        duration(d.activeMs),
      ])
        row.insertCell().textContent = v;
    }
    details.appendChild(table);
    return details;
  }
}
