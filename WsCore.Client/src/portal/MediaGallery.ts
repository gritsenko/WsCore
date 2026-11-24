/** One picture of a game's page: its cover or a screenshot. */
export interface MediaItem {
  url: string;
  alt: string;
  kind: 'cover' | 'shot';
}

/** Which picture is shown and whether it is open full screen; kept across re-renders. */
export interface MediaState {
  index: number;
  open: boolean;
}

/** The cover (if any) and then the screenshots, in their order. */
export function mediaItems(game: {
  title: string;
  coverUrl: string | null;
  screenshots: string[];
}): MediaItem[] {
  const items: MediaItem[] = [];
  if (game.coverUrl) items.push({ url: game.coverUrl, alt: game.title, kind: 'cover' });
  game.screenshots.forEach((url, i) =>
    items.push({ url, alt: `${game.title} — скриншот ${i + 1}`, kind: 'shot' })
  );
  return items;
}

/** `i` brought into 0…n-1, going round at both ends. */
export function wrapIndex(i: number, n: number): number {
  return n > 0 ? ((i % n) + n) % n : 0;
}

/** A finished touch drag: +1 = to the next picture (swiped left), -1 = back, 0 = not a swipe. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * The pictures of a game's page: a large picture with arrows and a counter, a row of
 * thumbnails below it (the cover first, then the screenshots), and — on a click on the
 * picture — the same pictures full screen. Arrows / keys / a swipe go round. The state
 * (which picture, open or not) is reported out so a re-drawn page keeps it.
 */
export default class MediaGallery {
  readonly element: HTMLDivElement;
  private index: number;
  private open: boolean;
  private readonly stageImg: HTMLImageElement;
  private readonly count: HTMLSpanElement;
  private readonly thumbs: HTMLButtonElement[] = [];
  private readonly strip: HTMLDivElement;
  private viewer: { box: HTMLDivElement; img: HTMLImageElement; count: HTMLSpanElement } | null =
    null;

  constructor(
    private readonly items: MediaItem[],
    state: MediaState,
    private readonly onState: (state: MediaState) => void
  ) {
    this.index = wrapIndex(state.index, items.length);
    this.open = false;
    this.element = div('portal-media');

    const stage = div('portal-media-stage');
    stage.tabIndex = 0;
    stage.setAttribute('role', 'button');
    stage.setAttribute('aria-label', 'Открыть на весь экран');
    this.stageImg = document.createElement('img');
    stage.appendChild(this.stageImg);
    stage.appendChild(this.arrow('prev', () => this.step(-1)));
    stage.appendChild(this.arrow('next', () => this.step(1)));
    this.count = span('portal-media-count');
    stage.appendChild(this.count);
    stage.onkeydown = e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        this.step(e.key === 'ArrowLeft' ? -1 : 1);
      } else if ((e.key === 'Enter' || e.key === ' ') && e.target === stage) {
        e.preventDefault();
        this.openViewer();
      }
    };
    onSwipe(
      stage,
      s => this.step(s),
      () => this.openViewer()
    );
    this.element.appendChild(stage);

    this.strip = div('portal-media-thumbs');
    items.forEach((item, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'portal-media-thumb';
      b.setAttribute('aria-label', item.kind === 'cover' ? 'Обложка' : `Скриншот ${i}`);
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = '';
      img.loading = 'lazy';
      b.appendChild(img);
      b.onclick = () => this.show(i);
      this.thumbs.push(b);
      this.strip.appendChild(b);
    });
    this.element.appendChild(this.strip);

    this.render();
    if (state.open) this.openViewer();
  }

  /** The picture shown now (for tests). */
  get current(): number {
    return this.index;
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(i: number): void {
    this.index = wrapIndex(i, this.items.length);
    this.render();
    this.report();
  }

  step(by: number): void {
    this.show(this.index + by);
  }

  openViewer(): void {
    if (this.viewer) return;
    const box = div('portal-viewer');
    box.tabIndex = -1;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Просмотр изображений');
    const img = document.createElement('img');
    img.className = 'portal-viewer-img';
    box.appendChild(img);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'portal-viewer-close';
    close.setAttribute('aria-label', 'Закрыть');
    close.textContent = '×';
    close.onclick = () => this.closeViewer();
    box.appendChild(close);
    if (this.items.length > 1) {
      box.appendChild(this.arrow('prev', () => this.step(-1)));
      box.appendChild(this.arrow('next', () => this.step(1)));
    }
    const count = span('portal-media-count portal-viewer-count');
    box.appendChild(count);
    box.onkeydown = e => {
      if (e.key === 'Escape') this.closeViewer();
      else if (e.key === 'ArrowLeft') this.step(-1);
      else if (e.key === 'ArrowRight') this.step(1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // A click on the dark backdrop (not the picture) closes it.
    onSwipe(
      box,
      s => this.step(s),
      e => {
        if (e.target === box) this.closeViewer();
      }
    );
    this.viewer = { box, img, count };
    this.open = true;
    this.element.appendChild(box);
    this.render();
    this.report();
    // Built during a page re-render the box is not in the document yet.
    requestAnimationFrame(() => {
      if (this.viewer?.box === box) box.focus();
    });
  }

  closeViewer(): void {
    if (!this.viewer) return;
    this.viewer.box.remove();
    this.viewer = null;
    this.open = false;
    this.report();
    (this.element.querySelector('.portal-media-stage') as HTMLElement | null)?.focus();
  }

  private render(): void {
    const item = this.items[this.index];
    if (!item) return;
    const many = this.items.length > 1;
    this.element.classList.toggle('portal-media-single', !many);
    this.stageImg.src = item.url;
    this.stageImg.alt = item.alt;
    this.stageImg.className = item.kind === 'cover' ? 'portal-media-fill' : 'portal-media-fit';
    const label = `${this.index + 1} / ${this.items.length}`;
    this.count.textContent = many ? label : '';
    this.thumbs.forEach((t, i) => {
      t.classList.toggle('portal-media-thumb-active', i === this.index);
      t.setAttribute('aria-current', i === this.index ? 'true' : 'false');
    });
    this.revealThumb();
    if (this.viewer) {
      this.viewer.img.src = item.url;
      this.viewer.img.alt = item.alt;
      this.viewer.count.textContent = many ? label : '';
    }
  }

  /** Scroll the thumbnail row (only it — never the page) so the active one is in view. */
  private revealThumb(): void {
    const t = this.thumbs[this.index];
    if (!t || this.strip.clientWidth === 0) return;
    const left = t.offsetLeft - this.strip.offsetLeft;
    const right = left + t.offsetWidth;
    if (left < this.strip.scrollLeft) this.strip.scrollLeft = left - 8;
    else if (right > this.strip.scrollLeft + this.strip.clientWidth)
      this.strip.scrollLeft = right - this.strip.clientWidth + 8;
  }

  private report(): void {
    this.onState({ index: this.index, open: this.open });
  }

  private arrow(dir: 'prev' | 'next', go: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `portal-media-arrow portal-media-${dir}`;
    b.setAttribute('aria-label', dir === 'prev' ? 'Предыдущее' : 'Следующее');
    b.textContent = dir === 'prev' ? '‹' : '›';
    b.onclick = e => {
      e.stopPropagation();
      go();
    };
    return b;
  }
}

/**
 * A horizontal touch swipe steps; a click (or a tap that did not swipe) calls `onClick`.
 * The click a browser may still fire after a swipe is swallowed.
 */
function onSwipe(
  target: HTMLElement,
  onStep: (step: 1 | -1) => void,
  onClick: (e: MouseEvent) => void
): void {
  let start: { x: number; y: number; id: number } | null = null;
  let swiped = false;
  target.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
  });
  target.addEventListener('pointerup', e => {
    if (!start || e.pointerId !== start.id) return;
    const step = swipeStep(e.clientX - start.x, e.clientY - start.y);
    start = null;
    if (step) {
      swiped = true;
      setTimeout(() => (swiped = false), 400);
      onStep(step);
    }
  });
  target.addEventListener('pointercancel', () => (start = null));
  target.addEventListener('click', e => {
    if (swiped) {
      swiped = false;
      return;
    }
    if ((e.target as HTMLElement).closest('.portal-media-arrow, .portal-viewer-close')) return;
    onClick(e);
  });
}

function div(className: string): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  return d;
}

function span(className: string): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = className;
  return s;
}
