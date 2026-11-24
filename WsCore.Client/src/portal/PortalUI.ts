import type { PortalGame } from '../network/ClientEvents';
import { renderMarkdown } from './Markdown';
import type { BoardPanel, BoardRow } from './Leaderboard';
import MediaGallery, { mediaItems, type MediaState } from './MediaGallery';

/** A board's settings as its editor reports them. */
export interface BoardSettings {
  title: string;
  invertSortOrder: boolean;
  scoreType: 'numeric' | 'time';
  decimalOffset: number;
}

/** The leaderboards block of a game's page: null = still loading. */
export interface BoardsView {
  boards: BoardPanel[];
  /** The game's owner / a server admin: settings, reset, delete. */
  canEdit: boolean;
}

/** Someone playing a game right now (in its room). */
export interface PortalPlayer {
  userId: number;
  name: string;
  avatarUrl: string | null;
}

export interface PortalCard {
  game: PortalGame;
  playing: PortalPlayer[];
}

export interface PortalCallbacks {
  /** A card was clicked: show the game's page. */
  onOpen(slug: string): void;
  /** "All games" on a game's page. */
  onBack(): void;
  onPlay(game: PortalGame): void;
  onBoardConfigure?(board: string, settings: BoardSettings): void;
  onBoardReset?(board: string): void;
  onBoardDelete?(board: string): void;
  /** "Edit" on a game's page (its owner, server admins). */
  onEdit?(game: PortalGame): void;
}

/**
 * The games portal's pages, drawn in the lobby's main area: the catalog (a grid of
 * cards) and a game's page (cover, title, tagline, description, who is playing, Play).
 * Pure view: it is told what to show and reports clicks. Its styles come with the
 * lobby's (LobbyUI loads Portal.css).
 */
export default class PortalUI {
  readonly element: HTMLDivElement;
  /** The game page's pictures: which one is shown, full screen or not — kept across re-draws. */
  private media: { gameId: string } & MediaState = { gameId: '', index: 0, open: false };

  constructor(private readonly callbacks: PortalCallbacks) {
    this.element = div('portal');
  }

  showCatalog(
    cards: PortalCard[],
    extra: { button?: HTMLElement; panel?: HTMLElement } = {}
  ): void {
    this.media = { gameId: '', index: 0, open: false };
    const page = div('portal-page');
    const head = div('portal-head');
    const h = el('h1', 'portal-h1', 'Игры');
    head.appendChild(h);
    head.appendChild(
      el(
        'p',
        'portal-lead',
        'Мини-игры с таблицами рекордов. Играйте вместе — у каждой игры свой чат.'
      )
    );
    if (extra.button) head.appendChild(extra.button);
    page.appendChild(head);
    if (extra.panel) page.appendChild(extra.panel);

    if (cards.length === 0) {
      page.appendChild(el('p', 'portal-empty', 'Игр пока нет.'));
    } else {
      const grid = div('portal-grid');
      for (const card of cards) grid.appendChild(this.buildCard(card));
      page.appendChild(grid);
    }
    this.element.replaceChildren(page);
  }

  /** A game's page; `null` = no such game (or not visible to us). */
  showGame(
    card: PortalCard | null,
    boards: BoardsView | null = null,
    editable = false,
    stats: { open: boolean; panel: HTMLElement | null; toggle(): void } | null = null
  ): void {
    const page = div('portal-page');
    // The wide header strip (or nothing: the hero's cover carries the page).
    if (card?.game.headerUrl) {
      const header = div('portal-header');
      header.style.backgroundImage = `url("${card.game.headerUrl.replace(/"/g, '%22')}")`;
      page.appendChild(header);
    }
    const back = el('button', 'portal-back', '← Все игры') as HTMLButtonElement;
    back.type = 'button';
    back.onclick = () => this.callbacks.onBack();
    page.appendChild(back);

    if (!card) {
      page.appendChild(el('p', 'portal-empty', 'Игра не найдена.'));
      this.element.replaceChildren(page);
      return;
    }

    const { game, playing } = card;
    const hero = div('portal-hero');
    hero.appendChild(this.buildMedia(game));
    const info = div('portal-hero-info');
    const title = el('h1', 'portal-h1', game.title);
    info.appendChild(title);
    if (!game.isPublic)
      info.appendChild(el('span', 'portal-badge', 'Черновик — видят только авторы'));
    if (game.tagline) info.appendChild(el('p', 'portal-lead', game.tagline));
    if (game.tags.length) info.appendChild(tags(game.tags));

    const actions = div('portal-actions');
    const play = el(
      'button',
      'portal-play',
      game.playUrl ? 'Играть' : 'Сборки ещё нет'
    ) as HTMLButtonElement;
    play.type = 'button';
    play.disabled = !game.playUrl;
    play.onclick = () => this.callbacks.onPlay(game);
    actions.appendChild(play);
    const share = el('button', 'portal-share', 'Скопировать ссылку') as HTMLButtonElement;
    share.type = 'button';
    share.onclick = () => {
      const url = `${location.origin}/games/${game.slug}`;
      void navigator.clipboard?.writeText(url).then(
        () => (share.textContent = 'Ссылка скопирована'),
        () => (share.textContent = url)
      );
    };
    actions.appendChild(share);
    if (editable) {
      const edit = el('button', 'portal-share portal-edit', 'Редактировать') as HTMLButtonElement;
      edit.type = 'button';
      edit.onclick = () => this.callbacks.onEdit?.(game);
      actions.appendChild(edit);
    }
    if (stats) {
      const toggle = el(
        'button',
        'portal-share portal-stats-toggle',
        stats.open ? 'Скрыть аналитику' : 'Аналитика'
      ) as HTMLButtonElement;
      toggle.type = 'button';
      toggle.onclick = () => stats.toggle();
      actions.appendChild(toggle);
    }
    info.appendChild(actions);

    const meta = div('portal-meta');
    if (game.plays) meta.appendChild(el('span', undefined, plays(game.plays)));
    if (game.version) meta.appendChild(el('span', undefined, `Версия ${game.version}`));
    if (game.updatedMs)
      meta.appendChild(
        el('span', undefined, `обновлена ${new Date(game.updatedMs).toLocaleDateString('ru-RU')}`)
      );
    info.appendChild(meta);
    if (playing.length) info.appendChild(players(playing));
    hero.appendChild(info);
    page.appendChild(hero);

    if (stats?.open && stats.panel) page.appendChild(stats.panel);
    if (boards && boards.boards.length) page.appendChild(this.buildBoards(boards));
    if (game.description) {
      const description = div('portal-description');
      description.appendChild(renderMarkdown(game.description));
      page.appendChild(description);
    }
    this.element.replaceChildren(page);
  }

  /** The cover alone, or the cover and the screenshots in a gallery that pages through them. */
  private buildMedia(game: PortalGame): HTMLElement {
    if (this.media.gameId !== game.id) this.media = { gameId: game.id, index: 0, open: false };
    if (!game.screenshots.length) return cover(game, 'portal-hero-cover');
    return new MediaGallery(mediaItems(game), this.media, state => {
      this.media = { gameId: game.id, ...state };
    }).element;
  }

  private buildBoards({ boards, canEdit }: BoardsView): HTMLElement {
    const box = div('portal-boards');
    box.appendChild(el('h2', 'portal-boards-title', 'Таблицы рекордов'));
    for (const board of boards) {
      const section = div('portal-board');
      const head = div('portal-board-head');
      head.appendChild(el('span', undefined, board.title));
      head.appendChild(
        el('span', 'portal-board-count', countOf(board.entryCount, 'игрок', 'игрока', 'игроков'))
      );
      section.appendChild(head);
      if (board.entries.length === 0)
        section.appendChild(el('div', 'portal-board-empty', 'Пока никого — будьте первым'));
      for (const row of board.entries) section.appendChild(boardRow(row));
      if (board.myEntry && board.myRank > board.entries.length) {
        section.appendChild(el('div', 'portal-board-gap', '…'));
        section.appendChild(boardRow(board.myEntry));
      }
      if (canEdit) section.appendChild(this.buildBoardSettings(board));
      box.appendChild(section);
    }
    return box;
  }

  private buildBoardSettings(board: BoardPanel): HTMLElement {
    const details = el('details', 'portal-board-settings') as HTMLDetailsElement;
    details.appendChild(el('summary', undefined, `Настройки · ${board.name}`));
    const form = div('portal-board-form');
    const title = el('input') as HTMLInputElement;
    title.type = 'text';
    title.placeholder = board.name;
    title.value = board.titleRaw;
    title.maxLength = 120;
    const invertLabel = el('label') as HTMLLabelElement;
    const invert = el('input') as HTMLInputElement;
    invert.type = 'checkbox';
    invert.checked = board.invertSortOrder;
    invertLabel.append(invert, document.createTextNode(' меньше — лучше'));
    const format = el('select') as HTMLSelectElement;
    for (const [value, label] of [
      ['numeric:0', 'Число'],
      ['numeric:1', 'Число, 1 знак'],
      ['numeric:2', 'Число, 2 знака'],
      ['time:0', 'Время (мс → м:сс)'],
    ]) {
      const option = el('option', undefined, label) as HTMLOptionElement;
      option.value = value;
      format.appendChild(option);
    }
    format.value =
      board.scoreType === 'time' ? 'time:0' : `numeric:${Math.min(board.decimalOffset, 2)}`;
    const save = el('button', 'portal-board-save', 'Сохранить') as HTMLButtonElement;
    save.type = 'button';
    save.onclick = () => {
      const [type, offset] = format.value.split(':');
      this.callbacks.onBoardConfigure?.(board.name, {
        title: title.value.trim(),
        invertSortOrder: invert.checked,
        scoreType: type === 'time' ? 'time' : 'numeric',
        decimalOffset: Number(offset) || 0,
      });
    };
    const reset = confirmButton('Очистить результаты', 'Точно очистить?', () =>
      this.callbacks.onBoardReset?.(board.name)
    );
    const remove = confirmButton('Удалить таблицу', 'Точно удалить?', () =>
      this.callbacks.onBoardDelete?.(board.name)
    );
    form.append(title, invertLabel, format, save, reset, remove);
    details.appendChild(form);
    return details;
  }

  private buildCard({ game, playing }: PortalCard): HTMLElement {
    const card = el('a', 'portal-card') as HTMLAnchorElement;
    card.href = `/games/${game.slug}`;
    card.onclick = e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab
      e.preventDefault();
      this.callbacks.onOpen(game.slug);
    };
    card.appendChild(cover(game, 'portal-card-cover'));
    const body = div('portal-card-body');
    const title = div('portal-card-title');
    title.textContent = game.title;
    if (!game.isPublic) title.appendChild(el('span', 'portal-badge', 'черновик'));
    body.appendChild(title);
    if (game.tagline) body.appendChild(el('div', 'portal-card-tagline', game.tagline));
    const foot = div('portal-card-foot');
    if (playing.length) foot.appendChild(el('span', 'portal-live', `играют: ${playing.length}`));
    if (game.plays) foot.appendChild(el('span', 'portal-card-plays', plays(game.plays)));
    if (game.tags.length)
      foot.appendChild(el('span', 'portal-card-tags', game.tags.slice(0, 3).join(' · ')));
    body.appendChild(foot);
    card.appendChild(body);
    return card;
  }
}

/** "1 игрок", "3 игрока", "5 игроков" — the Russian plural for a count. */
export function countOf(n: number, one: string, few: string, many: string): string {
  return `${n} ${pluralRu(n, one, few, many)}`;
}

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
}

/** "1 партия", "3 партии", "1,2 тыс. партий". */
export function plays(n: number): string {
  const word = pluralRu(n, 'партия', 'партии', 'партий');
  const compact = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
  if (n >= 1_000_000) return `${compact(Math.round(n / 100_000) / 10)} млн партий`;
  if (n >= 1000) return `${compact(Math.round(n / 100) / 10)} тыс. партий`;
  return `${n} ${word}`;
}

/** The game's cover, or — without one — a colour from its id and its initial. */
function cover(game: PortalGame, className: string): HTMLDivElement {
  const box = div(className);
  if (game.coverUrl) {
    const img = document.createElement('img');
    img.src = game.coverUrl;
    img.alt = game.title;
    img.loading = 'lazy';
    box.appendChild(img);
    return box;
  }
  let hash = 0;
  for (const ch of game.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  box.style.background = `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 50) % 360} 50% 18%))`;
  box.appendChild(el('span', 'portal-cover-letter', (game.title.trim()[0] ?? '?').toUpperCase()));
  return box;
}

function boardRow(row: BoardRow): HTMLDivElement {
  const line = div('portal-board-row');
  if (row.isPlayer) line.classList.add('portal-board-me');
  line.appendChild(el('span', 'portal-board-rank', String(row.rank)));
  const face = div('portal-face');
  if (row.avatarUrl) {
    const img = document.createElement('img');
    img.src = row.avatarUrl;
    img.alt = '';
    face.appendChild(img);
  } else face.textContent = (row.name.trim()[0] ?? '?').toUpperCase();
  line.appendChild(face);
  const name = el('span', 'portal-board-name', row.name);
  if (row.username) name.appendChild(el('span', 'portal-board-login', `@${row.username}`));
  line.appendChild(name);
  if (row.own) line.appendChild(el('span', 'portal-board-flag', 'автор'));
  if (row.hiddenFromOthers) line.appendChild(el('span', 'portal-board-flag', 'скрыт от других'));
  line.appendChild(el('span', 'portal-board-score', row.formattedScore));
  return line;
}

/** A destructive button: the first click asks, the second (within a few seconds) does it. */
function confirmButton(label: string, confirmLabel: string, action: () => void): HTMLButtonElement {
  const b = el('button', 'portal-board-danger', label) as HTMLButtonElement;
  b.type = 'button';
  let armed = false;
  b.onclick = () => {
    if (armed) {
      action();
      return;
    }
    armed = true;
    b.textContent = confirmLabel;
    setTimeout(() => {
      armed = false;
      b.textContent = label;
    }, 4000);
  };
  return b;
}

function tags(list: string[]): HTMLDivElement {
  const box = div('portal-tags');
  for (const tag of list) box.appendChild(el('span', 'portal-tag', tag));
  return box;
}

function players(list: PortalPlayer[]): HTMLDivElement {
  const box = div('portal-players');
  box.appendChild(el('span', 'portal-live', `Сейчас играют: ${list.length}`));
  const faces = div('portal-faces');
  for (const p of list.slice(0, 8)) {
    const face = div('portal-face');
    face.title = p.name;
    if (p.avatarUrl) {
      const img = document.createElement('img');
      img.src = p.avatarUrl;
      img.alt = '';
      face.appendChild(img);
    } else {
      face.textContent = (p.name.trim()[0] ?? '?').toUpperCase();
    }
    faces.appendChild(face);
  }
  box.appendChild(faces);
  return box;
}

function div(className: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
