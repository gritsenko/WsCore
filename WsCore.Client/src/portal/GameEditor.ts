import { el } from '../lobby/LobbyUI';
import type { PortalGame } from '../network/ClientEvents';
import { mediaIdOf } from './GamesApi';

export interface GameFieldsEdit {
  title: string;
  slug: string;
  tagline: string;
  tags: string[];
  description: string;
}

export interface GameEditorHandlers {
  onSave(fields: GameFieldsEdit): Promise<void>;
  onPublic(isPublic: boolean): Promise<void>;
  onUpload(kind: 'cover' | 'header' | 'screenshot', file: File): Promise<void>;
  onRemoveMedia(mediaId: string): Promise<void>;
  /** The screenshots as they should end up (ids, in order). */
  onReorder(ids: string[]): Promise<void>;
  onClose(): void;
}

/**
 * A game's card, edited in the page (its owner, server admins): the text fields, whether it
 * is published, and its pictures. Purely presentational like the profile dialog: it reports
 * what was done and shows the outcome it is told; the catalog's next update redraws it.
 */
export default class GameEditor {
  private readonly overlay: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly media: HTMLDivElement;
  private readonly publicBox: HTMLInputElement;
  private game: PortalGame;
  private busy = false;

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.handlers.onClose();
  };

  constructor(
    game: PortalGame,
    private readonly handlers: GameEditorHandlers
  ) {
    this.game = game;
    this.overlay = el('div', 'lobby-dialog-overlay portal-editor');
    this.overlay.onpointerdown = e => {
      if (e.target === this.overlay) handlers.onClose();
    };
    const dialog = el('div', 'lobby-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Редактирование игры');
    this.overlay.appendChild(dialog);

    const header = el('div', 'lobby-dialog-header');
    header.appendChild(el('span', 'lobby-dialog-title', 'Игра'));
    const close = el('button', 'lobby-dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.onclick = () => handlers.onClose();
    header.appendChild(close);
    dialog.appendChild(header);

    const field = (label: string, input: HTMLInputElement | HTMLTextAreaElement) => {
      dialog.appendChild(el('label', 'lobby-dialog-label', label));
      dialog.appendChild(input);
      return input;
    };
    const text = (value: string, max: number, placeholder = '') => {
      const input = el('input', 'lobby-dialog-input');
      input.type = 'text';
      input.value = value;
      input.maxLength = max;
      input.placeholder = placeholder;
      return input;
    };
    const title = field('Название', text(game.title, 64));
    const slug = field('Адрес страницы: /games/…', text(game.slug, 40));
    const tagline = field('Слоган — одна строка на карточке', text(game.tagline, 140));
    const tags = field(
      'Теги через запятую',
      text(game.tags.join(', '), 300, 'аркада, головоломка')
    );
    const description = el('textarea', 'lobby-dialog-input lobby-dialog-textarea');
    description.rows = 8;
    description.maxLength = 8000;
    description.value = game.description;
    description.placeholder =
      'Что это за игра, как играть. Поддерживается **жирный**, *курсив*, списки «- », заголовки «## ».';
    field('Описание', description);

    const saveRow = el('div', 'lobby-dialog-buttons');
    const save = el('button', 'lobby-dialog-button lobby-dialog-button-primary', 'Сохранить');
    save.type = 'button';
    save.onclick = () =>
      this.run(() =>
        handlers.onSave({
          title: title.value.trim(),
          slug: slug.value.trim().toLowerCase(),
          tagline: tagline.value.trim(),
          tags: tags.value
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
          description: description.value,
        })
      );
    this.status = el('div', 'lobby-dialog-status');
    this.status.hidden = true;
    saveRow.append(save, this.status);
    dialog.appendChild(saveRow);

    const publicRow = el('label', 'lobby-dialog-check');
    this.publicBox = el('input');
    this.publicBox.type = 'checkbox';
    this.publicBox.checked = game.isPublic;
    this.publicBox.onchange = () => this.run(() => handlers.onPublic(this.publicBox.checked));
    publicRow.append(this.publicBox, document.createTextNode(' Опубликована — видна всем'));
    dialog.appendChild(publicRow);

    this.media = el('div', 'lobby-dialog-account');
    dialog.appendChild(this.media);
    this.renderMedia();

    (document.getElementById('lobby-container') ?? document.body).appendChild(this.overlay);
    document.addEventListener('keydown', this.onKeyDown);
  }

  /** The catalog changed (our save landed, or someone else's): redraw what follows the server. */
  update(game: PortalGame): void {
    this.game = game;
    this.publicBox.checked = game.isPublic;
    this.renderMedia();
  }

  showStatus(text: string, isError = false): void {
    this.status.textContent = text;
    this.status.hidden = !text;
    this.status.classList.toggle('lobby-dialog-status-error', isError);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.overlay.remove();
  }

  private run(action: () => Promise<void>): void {
    if (this.busy) return;
    this.busy = true;
    this.showStatus('Сохраняю…');
    action()
      .then(
        () => this.showStatus('Сохранено'),
        (e: unknown) =>
          this.showStatus(e instanceof Error ? e.message : 'Не удалось сохранить', true)
      )
      .finally(() => {
        this.busy = false;
      });
  }

  private renderMedia(): void {
    const game = this.game;
    this.media.replaceChildren(el('div', 'lobby-dialog-section-title', 'Картинки'));

    const slot = (label: string, url: string, kind: 'cover' | 'header', hint: string) => {
      this.media.appendChild(el('div', 'lobby-dialog-hint', `${label} — ${hint}`));
      const row = el('div', 'portal-editor-media');
      if (url)
        row.appendChild(this.thumb(url, kind === 'header' ? () => this.remove(url) : undefined));
      row.appendChild(
        this.picker(url ? 'Заменить' : 'Загрузить', false, files => this.upload(kind, files))
      );
      this.media.appendChild(row);
    };
    slot('Обложка', game.coverUrl, 'cover', 'карточки, превью ссылок; лучше 16:9 или 1200×630');
    slot('Шапка', game.headerUrl, 'header', 'широкая полоса над страницей, 4:1; без неё — ничего');

    this.media.appendChild(el('div', 'lobby-dialog-hint', 'Скриншоты — по порядку'));
    const shots = el('div', 'portal-editor-media');
    const ids = game.screenshots.map(mediaIdOf);
    game.screenshots.forEach((url, i) => {
      const move = (delta: number) => {
        const order = [...ids];
        [order[i], order[i + delta]] = [order[i + delta], order[i]];
        this.run(() => this.handlers.onReorder(order));
      };
      shots.appendChild(
        this.thumb(
          url,
          () => this.remove(url),
          i > 0 ? () => move(-1) : undefined,
          i < ids.length - 1 ? () => move(1) : undefined
        )
      );
    });
    shots.appendChild(this.picker('Добавить', true, files => this.upload('screenshot', files)));
    this.media.appendChild(shots);
  }

  private upload(kind: 'cover' | 'header' | 'screenshot', files: File[]): void {
    this.run(async () => {
      for (const file of files) await this.handlers.onUpload(kind, file);
    });
  }

  private remove(url: string): void {
    this.run(() => this.handlers.onRemoveMedia(mediaIdOf(url)));
  }

  private thumb(
    url: string,
    onRemove?: () => void,
    onLeft?: () => void,
    onRight?: () => void
  ): HTMLElement {
    const box = el('div', 'portal-editor-thumb');
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    box.appendChild(img);
    const actions = el('div', 'portal-editor-thumb-actions');
    const action = (label: string, title: string, fn?: () => void) => {
      if (!fn) return;
      const b = el('button', undefined, label);
      b.type = 'button';
      b.title = title;
      b.onclick = fn;
      actions.appendChild(b);
    };
    action('←', 'Левее', onLeft);
    action('→', 'Правее', onRight);
    action('×', 'Убрать', onRemove);
    box.appendChild(actions);
    return box;
  }

  private picker(label: string, multiple: boolean, onFiles: (files: File[]) => void): HTMLElement {
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.hidden = true;
    input.onchange = () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      if (files.length) onFiles(files);
    };
    const button = el('button', 'lobby-dialog-button', label);
    button.type = 'button';
    button.onclick = () => input.click();
    const wrap = el('div');
    wrap.append(button, input);
    return wrap;
  }
}
