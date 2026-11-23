/** What the counter reads: "1" … "99", then "99+". */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** The tab title with the unread count in front ("(3) TOX"); the base title at 0. */
export function titleWithCount(baseTitle: string, count: number): string {
  return count > 0 ? `(${badgeText(count)}) ${baseTitle}` : baseTitle;
}

/**
 * Shows the number of unread messages everywhere the user may glance: the tab title,
 * the favicon (the site icon with a red counter drawn over it) and — for the installed
 * app — the icon badge on the home screen / taskbar (`navigator.setAppBadge`, where
 * supported). Purely presentational: the count comes from ChatAlerts.
 */
export default class UnreadBadge {
  private static readonly SIZE = 64;

  private readonly doc: Document;
  private readonly baseTitle: string;
  private link: HTMLLinkElement | null = null;
  private baseIconHref = '';
  /** The site icon, loaded once, to draw the counter on. */
  private icon: HTMLImageElement | null = null;
  private iconReady = false;
  private count = 0;

  constructor(doc: Document = document) {
    this.doc = doc;
    this.baseTitle = doc.title;
  }

  get value(): number {
    return this.count;
  }

  set(count: number): void {
    count = Math.max(0, Math.floor(count));
    if (count === this.count) return;
    this.count = count;
    this.doc.title = titleWithCount(this.baseTitle, count);
    this.drawFavicon();
    this.setAppBadge(count);
  }

  private setAppBadge(count: number): void {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
      done?.catch(() => {}); // not installed / not allowed: the title and favicon still show it
    } catch {
      /* unsupported */
    }
  }

  private drawFavicon(): void {
    if (!this.link) {
      this.link = this.doc.querySelector<HTMLLinkElement>('link[rel~="icon"]');
      if (!this.link) return;
      this.baseIconHref = this.link.href;
    }
    if (this.count === 0) {
      this.link.type = 'image/svg+xml';
      this.link.href = this.baseIconHref;
      return;
    }
    if (!this.icon) {
      this.icon = new Image();
      this.icon.onload = () => {
        this.iconReady = true;
        this.drawFavicon();
      };
      this.icon.src = this.baseIconHref;
    }
    if (!this.iconReady) return; // drawn once the icon has loaded

    const size = UnreadBadge.SIZE;
    const canvas = this.doc.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.icon, 0, 0, size, size);

    const text = badgeText(this.count);
    const radius = text.length > 2 ? 22 : 19;
    const cx = size - radius;
    const cy = radius;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#e5484d';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#141615';
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${text.length > 2 ? 20 : text.length > 1 ? 24 : 30}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 2);

    try {
      this.link.type = 'image/png';
      this.link.href = canvas.toDataURL('image/png');
    } catch {
      /* a tainted canvas cannot happen with our own icon, but never break the page */
    }
  }
}
