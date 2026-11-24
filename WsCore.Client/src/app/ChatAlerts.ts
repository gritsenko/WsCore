import type WsClient from '../network/WsClient';
import type { ChatEntry } from '../network/ChatLog';
import type { Unsubscribe } from '../utils/Emitter';
import { entryText } from '../lobby/AsciiArt';

/**
 * Where notifications stand on this device, as the profile dialog shows it:
 *  - `unsupported` — the browser has no notifications at all;
 *  - `install` — iOS / iPadOS Safari: only a web app added to the Home Screen may notify;
 *  - `denied` — blocked in the browser's site settings (only the user can undo that);
 *  - `off` / `on` — the user's choice here.
 */
export type AlertsStatus = 'unsupported' | 'install' | 'denied' | 'off' | 'on';

/** The part of WsClient ChatAlerts uses (a fake in tests). */
export type AlertsClient = Pick<
  WsClient,
  | 'on'
  | 'isOwnMessage'
  | 'roomManager'
  | 'presence'
  | 'avatarUrl'
  | 'pushPublicKey'
  | 'subscribePush'
  | 'unsubscribePush'
>;

/** The browser surface ChatAlerts needs — injectable so the rules are testable. */
export interface AlertsEnv {
  /** The user is looking at the page: the tab is visible and the window focused. */
  isAttended(): boolean;
  /** `fn` runs whenever attention may have changed (visibility, focus, blur). */
  onAttentionChange(fn: () => void): () => void;
  /** 'unsupported' when there are no notifications in this browser. */
  permission(): NotificationPermission | 'unsupported';
  requestPermission(): Promise<NotificationPermission>;
  /** iOS Safari outside an installed web app (push needs "Add to Home Screen"). */
  needsInstall(): boolean;
  /** The active service worker registration; null if there is none (yet). */
  serviceWorker(): Promise<ServiceWorkerRegistration | null>;
  /** The user's stored choice: true / false, or null if never chosen. */
  loadSetting(): boolean | null;
  saveSetting(on: boolean): void;
}

/** Notifications for one room replace each other (the count goes up instead). */
export const NOTIFICATION_TAG_PREFIX = 'chat-';
export const APP_ICON = '/icons/icon-192.png';
export const BADGE_ICON = '/icons/badge-96.png';

/** What a room's notification says after `count` unread messages, `entry` the newest. */
export function notificationContent(
  roomName: string,
  count: number,
  entry: Pick<ChatEntry, 'name' | 'text' | 'artId'>
): { title: string; body: string } {
  return {
    title: count > 1 ? `${roomName} · ${count} новых` : roomName,
    body: `${entry.name}: ${entryText(entry)}`,
  };
}

/** base64url → bytes (the VAPID key as `applicationServerKey`). */
export function decodeBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sameBytes(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/**
 * New-message alerts for the unified client:
 *
 *  - **Unread counter.** A message from someone else that arrives while the user is not
 *    looking at the page (tab hidden or window unfocused) bumps the counter shown in the
 *    tab title, on the favicon and on the installed app's icon (UnreadBadge); looking at
 *    the page again clears it, together with the notifications already shown.
 *  - **Notifications, two sources, never both.** While this page is open and its user
 *    active (not away), the page itself shows a system notification for such a message.
 *    When the user is away (idle) or offline, the server sends a Web Push instead (the
 *    service worker shows it, public/sw.js) — the server never pushes to an online user.
 *    Either way a room has one notification that is updated with the count.
 *  - **The subscription.** Turning notifications on asks for the permission (must be
 *    a click), subscribes this browser with the server's VAPID key and registers the
 *    subscription — again after every identify (`pushConfig`), which also moves it to
 *    the user this device now is. Turning them off unsubscribes.
 */
export default class ChatAlerts {
  private readonly client: AlertsClient;
  private readonly isAway: () => boolean;
  private readonly badge: { set(count: number): void };
  private readonly env: AlertsEnv;
  private unsubs: Unsubscribe[] = [];
  private unread = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    client: AlertsClient,
    isAway: () => boolean,
    badge: { set(count: number): void },
    env: AlertsEnv = browserEnv()
  ) {
    this.client = client;
    this.isAway = isAway;
    this.badge = badge;
    this.env = env;
  }

  start(): void {
    this.unsubs.push(
      this.client.on('chat', (roomId, entry) => this.onChat(roomId, entry)),
      this.client.on('pushConfig', key => {
        if (this.status === 'on') void this.syncSubscription(key);
      }),
      this.env.onAttentionChange(() => this.onAttention())
    );
  }

  stop(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.badge.set(0);
  }

  get unreadCount(): number {
    return this.unread;
  }

  get status(): AlertsStatus {
    const permission = this.env.permission();
    if (permission === 'unsupported') return this.env.needsInstall() ? 'install' : 'unsupported';
    if (permission === 'denied') return 'denied';
    if (permission === 'granted' && this.env.loadSetting() !== false) return 'on';
    return 'off';
  }

  /** `fn` runs when `status` may have changed; returns the unsubscribe. */
  onStatusChange(fn: () => void): Unsubscribe {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Turn notifications on (call from a click: it may ask for the permission). */
  async enable(): Promise<AlertsStatus> {
    let permission = this.env.permission();
    if (permission === 'default') {
      try {
        permission = await this.env.requestPermission();
      } catch {
        permission = 'default';
      }
    }
    if (permission === 'granted') {
      this.env.saveSetting(true);
      if (this.client.pushPublicKey) await this.syncSubscription(this.client.pushPublicKey);
    }
    this.changed();
    return this.status;
  }

  async disable(): Promise<void> {
    this.env.saveSetting(false);
    this.changed();
    try {
      const subscription = await (await this.env.serviceWorker())?.pushManager.getSubscription();
      if (subscription) {
        this.client.unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
    } catch (err) {
      console.warn('ChatAlerts: unsubscribe failed', err);
    }
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  private onChat(roomId: string, entry: ChatEntry): void {
    if (this.client.isOwnMessage(entry) || this.env.isAttended()) return;
    this.unread++;
    this.badge.set(this.unread);
    // Away: the server pushes this one (see the class comment).
    if (this.status === 'on' && !this.isAway()) void this.showNotification(roomId, entry);
  }

  private onAttention(): void {
    if (!this.env.isAttended()) return;
    if (this.unread !== 0) {
      this.unread = 0;
      this.badge.set(0);
    }
    void this.closeNotifications();
  }

  private async showNotification(roomId: string, entry: ChatEntry): Promise<void> {
    try {
      const registration = await this.env.serviceWorker();
      if (!registration) return;
      const tag = NOTIFICATION_TAG_PREFIX + roomId;
      const previous = (await registration.getNotifications({ tag }))[0];
      const count = ((previous?.data as { count?: number } | undefined)?.count ?? 0) + 1;
      const roomName = this.client.roomManager.getRoom(roomId)?.name ?? roomId;
      const { title, body } = notificationContent(roomName, count, entry);
      await registration.showNotification(title, {
        body,
        tag,
        // Only the first message of a burst buzzes; later ones update it silently.
        renotify: count === 1,
        icon: this.client.avatarUrl(this.client.presence.get(entry.userId)) ?? APP_ICON,
        badge: BADGE_ICON,
        data: { roomId, count },
      } as NotificationOptions);
    } catch (err) {
      console.warn('ChatAlerts: could not show a notification', err);
    }
  }

  private async closeNotifications(): Promise<void> {
    try {
      const registration = await this.env.serviceWorker();
      if (!registration) return;
      for (const n of await registration.getNotifications()) {
        if (n.tag.startsWith(NOTIFICATION_TAG_PREFIX)) n.close();
      }
    } catch {
      /* nothing to close */
    }
  }

  private async syncSubscription(publicKey: string): Promise<void> {
    try {
      const registration = await this.env.serviceWorker();
      const pushManager = registration?.pushManager;
      if (!pushManager) return; // notifications without push (the page still shows its own)
      const key = decodeBase64Url(publicKey);
      let subscription = await pushManager.getSubscription();
      if (subscription && !sameBytes(subscription.options.applicationServerKey, key)) {
        // Made with another server key (the server's keys changed): useless now.
        await subscription.unsubscribe();
        subscription = null;
      }
      subscription ??= await pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as BufferSource,
      });
      const json = subscription.toJSON();
      if (json.endpoint && json.keys?.p256dh && json.keys.auth)
        this.client.subscribePush(json.endpoint, json.keys.p256dh, json.keys.auth);
    } catch (err) {
      console.warn('ChatAlerts: push subscription failed', err);
    }
  }
}

const SETTING_KEY = 'wscore.notifications';

/** The real browser behind AlertsEnv. */
export function browserEnv(): AlertsEnv {
  return {
    isAttended: () => document.visibilityState === 'visible' && document.hasFocus(),
    onAttentionChange(fn) {
      document.addEventListener('visibilitychange', fn);
      window.addEventListener('focus', fn);
      window.addEventListener('blur', fn);
      return () => {
        document.removeEventListener('visibilitychange', fn);
        window.removeEventListener('focus', fn);
        window.removeEventListener('blur', fn);
      };
    },
    permission: () =>
      typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    needsInstall() {
      const iOS =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      return iOS && !standalone;
    },
    async serviceWorker() {
      if (!('serviceWorker' in navigator)) return null;
      // `ready` never settles if registering failed: don't wait for it forever.
      const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 5000));
      return Promise.race([navigator.serviceWorker.ready, timeout]);
    },
    loadSetting() {
      try {
        const value = localStorage.getItem(SETTING_KEY);
        return value === null ? null : value === '1';
      } catch {
        return null;
      }
    },
    saveSetting(on) {
      try {
        localStorage.setItem(SETTING_KEY, on ? '1' : '0');
      } catch {
        /* storage unavailable: the choice lasts for this page only via the permission */
      }
    },
  };
}
