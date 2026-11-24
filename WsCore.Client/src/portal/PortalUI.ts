import type { PortalGame } from '../network/ClientEvents';
import { renderMarkdown } from './Markdown';

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
}

/**
 * The games portal's pages, drawn in the lobby's main area: the catalog (a grid of
 * cards) and a game's page (cover, title, tagline, description, who is playing, Play).
 * Pure view: it is told what to show and reports clicks. Its styles come with the
 * lobby's (LobbyUI loads Portal.css).
 */
export default class PortalUI {
  readonly element: HTMLDivElement;

  constructor(private readonly callbacks: PortalCallbacks) {
    this.element = div('portal');
  }

  showCatalog(cards: PortalCard[]): void {
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
    page.appendChild(head);

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
  showGame(card: PortalCard | null): void {
    const page = div('portal-page');
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
    hero.appendChild(cover(game, 'portal-hero-cover'));
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

    if (game.description) {
      const description = div('portal-description');
      description.appendChild(renderMarkdown(game.description));
      page.appendChild(description);
    }
    this.element.replaceChildren(page);
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

/** "1 партия", "3 партии", "1,2 тыс. партий". */
export function plays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'партия'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'партии'
        : 'партий';
  const compact = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));
  if (n >= 1_000_000) return `${compact(Math.round(n / 100_000) / 10)} млн партий`;
  if (n >= 1000) return `${compact(Math.round(n / 100) / 10)} тыс. партий`;
  return `${n} ${word}`;
}

/** A cover until real covers exist: a colour from the game's id and its initial. */
function cover(game: PortalGame, className: string): HTMLDivElement {
  const box = div(className);
  let hash = 0;
  for (const ch of game.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  box.style.background = `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 50) % 360} 50% 18%))`;
  box.appendChild(el('span', 'portal-cover-letter', (game.title.trim()[0] ?? '?').toUpperCase()));
  return box;
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
