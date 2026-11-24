import { el } from './LobbyUI';
import { KAOMOJI } from './kaomoji';
import { AsciiArt, artById, artCategories, pickerArts, searchArts } from './AsciiArt';
import Recents from '../utils/Recents';

export interface ChatPickerHandlers {
  /** A kaomoji to put into the message being typed (the picker stays open). */
  onKaomoji(text: string): void;
  /** An art to send right away (the picker closes). */
  onArt(id: string): void;
  onClose(): void;
}

export type ChatPickerTab = 'kaomoji' | 'art';

const RECENT = 'recent';
const ALL = 'all';

/**
 * The composer's picker: kaomoji (inserted into the text) and ASCII art (sent as a
 * picture, by id). A popover above the composer; Esc or a click outside closes it.
 * Only presentation — LobbyUI decides what a pick does.
 */
export default class ChatPicker {
  readonly element: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly tabs = new Map<ChatPickerTab, HTMLButtonElement>();
  private tab: ChatPickerTab;
  private artCategory = ALL;
  private artQuery = '';
  private readonly recentKaomoji = new Recents('wscore.recentKaomoji', 24);
  private readonly recentArt = new Recents('wscore.recentArt', 12);
  /** Remembered across openings (a module-level choice, like Discord's). */
  private static lastTab: ChatPickerTab = 'kaomoji';

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.handlers.onClose();
    }
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    const target = e.target as Node | null;
    if (target && !this.element.contains(target) && !this.anchor.contains(target))
      this.handlers.onClose();
  };

  constructor(
    parent: HTMLElement,
    /** The button that opened it: clicks on it toggle rather than count as outside. */
    private readonly anchor: HTMLElement,
    private readonly handlers: ChatPickerHandlers
  ) {
    this.tab = ChatPicker.lastTab;
    this.element = el('div', 'lobby-picker');
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-label', 'Каомодзи и ASCII-арт');

    const tabRow = el('div', 'lobby-picker-tabs');
    tabRow.setAttribute('role', 'tablist');
    for (const [id, label] of [
      ['kaomoji', 'Каомодзи'],
      ['art', 'ASCII-арт'],
    ] as const) {
      const button = el('button', 'lobby-picker-tab', label);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.dataset.tab = id;
      button.onclick = () => this.showTab(id);
      this.tabs.set(id, button);
      tabRow.appendChild(button);
    }
    this.element.appendChild(tabRow);

    this.body = el('div', 'lobby-picker-body');
    this.element.appendChild(this.body);

    parent.appendChild(this.element);
    document.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('pointerdown', this.onPointerDown, true);
    this.showTab(this.tab);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    this.element.remove();
  }

  showTab(tab: ChatPickerTab): void {
    this.tab = ChatPicker.lastTab = tab;
    for (const [id, button] of this.tabs) {
      button.classList.toggle('lobby-picker-tab-active', id === tab);
      button.setAttribute('aria-selected', String(id === tab));
    }
    if (tab === 'kaomoji') this.renderKaomoji();
    else this.renderArt();
  }

  // ==================== kaomoji ====================

  private renderKaomoji(): void {
    const list = el('div', 'lobby-picker-scroll');
    const recent = this.recentKaomoji.list;
    if (recent.length) list.append(...this.kaomojiSection('Недавние', recent));
    for (const category of KAOMOJI)
      list.append(...this.kaomojiSection(category.title, category.items));
    this.body.replaceChildren(list);
  }

  private kaomojiSection(title: string, items: readonly string[]): HTMLElement[] {
    const grid = el('div', 'lobby-picker-kaomoji');
    for (const text of items) {
      const button = el('button', 'lobby-picker-kaomoji-item', text);
      button.type = 'button';
      button.title = text;
      button.onclick = () => {
        this.recentKaomoji.push(text);
        this.handlers.onKaomoji(text);
      };
      grid.appendChild(button);
    }
    return [el('div', 'lobby-picker-section', title), grid];
  }

  // ==================== art ====================

  private renderArt(): void {
    const search = el('input', 'lobby-picker-search');
    search.type = 'search';
    search.placeholder = 'Найти арт: кот, gg, праздник…';
    search.value = this.artQuery;
    search.setAttribute('aria-label', 'Поиск арта');

    const chips = el('div', 'lobby-picker-chips');
    const categories = [
      ...(this.recentArt.list.some(id => artById(id)) ? [[RECENT, 'Недавние']] : []),
      [ALL, 'Все'],
      ...artCategories().map(c => [c, c]),
    ];
    if (!categories.some(([id]) => id === this.artCategory)) this.artCategory = ALL;
    for (const [id, label] of categories) {
      const chip = el('button', 'lobby-picker-chip', label);
      chip.type = 'button';
      chip.classList.toggle('lobby-picker-chip-active', id === this.artCategory);
      chip.onclick = () => {
        this.artCategory = id;
        for (const other of chips.children)
          other.classList.toggle('lobby-picker-chip-active', other === chip);
        fill();
      };
      chips.appendChild(chip);
    }

    const grid = el('div', 'lobby-picker-scroll lobby-picker-arts');
    const fill = (): void => {
      let arts: AsciiArt[];
      if (this.artQuery.trim())
        arts = searchArts(this.artQuery); // searches everything
      else if (this.artCategory === RECENT)
        arts = this.recentArt.list.map(artById).filter((a): a is AsciiArt => !!a && !a.hidden);
      else if (this.artCategory === ALL) arts = pickerArts();
      else arts = pickerArts().filter(a => a.category === this.artCategory);
      chips.hidden = !!this.artQuery.trim();
      grid.replaceChildren(
        ...(arts.length
          ? arts.map(a => this.artTile(a))
          : [el('div', 'lobby-picker-empty', 'Ничего не нашлось')])
      );
    };
    search.oninput = () => {
      this.artQuery = search.value;
      fill();
    };
    fill();
    this.body.replaceChildren(search, chips, grid);
    search.focus({ preventScroll: true });
  }

  private artTile(art: AsciiArt): HTMLButtonElement {
    const tile = el('button', 'lobby-picker-art');
    tile.type = 'button';
    tile.title = art.title;
    tile.dataset.artId = art.id;
    tile.setAttribute('aria-label', `Отправить арт «${art.title}»`);
    const preview = el('div', 'lobby-picker-art-preview');
    const pre = el('pre', 'lobby-art lobby-art-small', art.lines.join('\n'));
    pre.style.setProperty('--cols', String(art.cols));
    pre.setAttribute('aria-hidden', 'true');
    preview.appendChild(pre);
    tile.append(preview, el('span', 'lobby-picker-art-title', art.title));
    tile.onclick = () => {
      this.recentArt.push(art.id);
      this.handlers.onArt(art.id);
    };
    return tile;
  }
}
