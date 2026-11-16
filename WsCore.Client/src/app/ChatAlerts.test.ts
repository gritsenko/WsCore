import { describe, it, expect, vi } from 'vitest';
import ChatAlerts, {
  AlertsClient,
  AlertsEnv,
  decodeBase64Url,
  notificationContent,
} from './ChatAlerts';
import Emitter from '../utils/Emitter';
import type { ClientEvents } from '../network/ClientEvents';
import type { ChatEntry } from '../network/ChatLog';
import { badgeText, titleWithCount } from '../utils/UnreadBadge';

const ME = 1;
const SERVER_KEY =
  'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';

function entry(id: number, userId: number, text = 'hi'): ChatEntry {
  return { id, userId, name: userId === ME ? 'Me' : 'Bob', text, sentAtMs: 0 };
}

interface FakeNotification {
  title: string;
  options: NotificationOptions & { data?: { count?: number }; tag: string; renotify?: boolean };
  closed: boolean;
}

/** A fake browser + server: attention, permission, a service worker with notifications and push. */
function setup(
  opts: { permission?: NotificationPermission | 'unsupported'; setting?: boolean | null } = {}
) {
  const emitter = new Emitter<ClientEvents>();
  const subscribed: string[][] = [];
  const unsubscribed: string[] = [];
  const client = {
    on: (event: keyof ClientEvents, fn: never) => emitter.on(event, fn),
    isOwnMessage: (e: ChatEntry) => e.userId === ME,
    roomManager: { getRoom: (id: string) => ({ name: id === 'lobby' ? 'Лобби' : id }) },
    presence: new Map(),
    avatarUrl: () => null,
    pushPublicKey: null as string | null,
    subscribePush: (...args: string[]) => subscribed.push(args),
    unsubscribePush: (endpoint: string) => unsubscribed.push(endpoint),
  } as unknown as AlertsClient & { pushPublicKey: string | null };

  const notifications: FakeNotification[] = [];
  let subscription: {
    endpoint: string;
    options: { applicationServerKey: ArrayBuffer | null };
    unsubscribe: () => Promise<boolean>;
    toJSON: () => PushSubscriptionJSON;
  } | null = null;
  const makeSubscription = (key: ArrayBuffer | null, endpoint = 'https://push.example/1') => ({
    endpoint,
    options: { applicationServerKey: key },
    unsubscribe: async () => {
      subscription = null;
      return true;
    },
    toJSON: () => ({ endpoint, keys: { p256dh: 'P', auth: 'A' } }),
  });
  const registration = {
    getNotifications: async (filter?: { tag?: string }) =>
      notifications.filter(n => !n.closed && (!filter?.tag || n.options.tag === filter.tag)),
    showNotification: async (title: string, options: FakeNotification['options']) => {
      for (const n of notifications) if (n.options.tag === options.tag) n.closed = true;
      notifications.push({ title, options, closed: false });
    },
    pushManager: {
      getSubscription: async () => subscription,
      subscribe: vi.fn(async (o: { applicationServerKey: Uint8Array }) => {
        subscription = makeSubscription(o.applicationServerKey.slice().buffer);
        return subscription;
      }),
    },
  };
  // The page gets notification objects it can read the tag / data of and close.
  const originalGet = registration.getNotifications;
  registration.getNotifications = async filter =>
    (await originalGet(filter)).map(n =>
      Object.assign(n, { tag: n.options.tag, close: () => (n.closed = true), data: n.options.data })
    );

  let attended = false;
  let attentionListener: (() => void) | null = null;
  let permission = opts.permission ?? 'granted';
  let setting = opts.setting === undefined ? null : opts.setting;
  const env: AlertsEnv = {
    isAttended: () => attended,
    onAttentionChange(fn) {
      attentionListener = fn;
      return () => (attentionListener = null);
    },
    permission: () => permission,
    requestPermission: vi.fn(async () => {
      permission = 'granted';
      return permission;
    }),
    needsInstall: () => false,
    serviceWorker: async () => registration as unknown as ServiceWorkerRegistration,
    loadSetting: () => setting,
    saveSetting: on => (setting = on),
  };

  let away = false;
  const badge: number[] = [];
  const alerts = new ChatAlerts(client, () => away, { set: n => badge.push(n) }, env);
  alerts.start();

  return {
    alerts,
    client,
    env,
    emitter,
    badge,
    notifications: () => notifications.filter(n => !n.closed),
    subscribed,
    unsubscribed,
    registration,
    setSubscription: (key: ArrayBuffer | null) =>
      (subscription = makeSubscription(key, 'https://push.example/old')),
    getSubscription: () => subscription,
    setAttended(value: boolean) {
      attended = value;
      attentionListener?.();
    },
    setAway: (value: boolean) => (away = value),
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('UnreadBadge text', () => {
  it('puts the count in front of the title, capped at 99+', () => {
    expect(titleWithCount('WAVE', 0)).toBe('WAVE');
    expect(titleWithCount('WAVE', 3)).toBe('(3) WAVE');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });
});

describe('ChatAlerts', () => {
  it('counts messages from others while the page is not looked at, and clears on return', async () => {
    const t = setup();
    t.emitter.emit('chat', 'lobby', entry(1, 2));
    t.emitter.emit('chat', 'lobby', entry(2, ME)); // our own: never counted
    t.emitter.emit('chat', 'lobby', entry(3, 2));
    expect(t.alerts.unreadCount).toBe(2);
    expect(t.badge).toEqual([1, 2]);

    t.setAttended(true);
    expect(t.alerts.unreadCount).toBe(0);
    expect(t.badge[t.badge.length - 1]).toBe(0);

    t.emitter.emit('chat', 'lobby', entry(4, 2)); // looking at it: nothing to count
    expect(t.alerts.unreadCount).toBe(0);
  });

  it('shows one notification per room that counts up, and closes them on return', async () => {
    const t = setup();
    t.emitter.emit('chat', 'lobby', entry(1, 2, 'первое'));
    await flush();
    t.emitter.emit('chat', 'lobby', entry(2, 2, 'второе'));
    await flush();

    const [shown] = t.notifications();
    expect(t.notifications()).toHaveLength(1);
    expect(shown.title).toBe('Лобби · 2 новых');
    expect(shown.options.body).toBe('Bob: второе');
    expect(shown.options.tag).toBe('chat-lobby');
    expect(shown.options.renotify).toBe(false); // the burst's later messages are silent
    expect(shown.options.data).toEqual({ roomId: 'lobby', count: 2 });

    t.setAttended(true);
    await flush();
    expect(t.notifications()).toHaveLength(0);
  });

  it('leaves notifications to the server while the user is away, or when they are off', async () => {
    const away = setup();
    away.setAway(true);
    away.emitter.emit('chat', 'lobby', entry(1, 2));
    await flush();
    expect(away.notifications()).toHaveLength(0);
    expect(away.alerts.unreadCount).toBe(1); // the counter still counts

    const off = setup({ setting: false });
    off.emitter.emit('chat', 'lobby', entry(1, 2));
    await flush();
    expect(off.notifications()).toHaveLength(0);
  });

  it('derives the status from the permission and the stored choice', () => {
    expect(setup({ permission: 'granted' }).alerts.status).toBe('on');
    expect(setup({ permission: 'granted', setting: false }).alerts.status).toBe('off');
    expect(setup({ permission: 'default', setting: true }).alerts.status).toBe('off');
    expect(setup({ permission: 'denied' }).alerts.status).toBe('denied');
    expect(setup({ permission: 'unsupported' }).alerts.status).toBe('unsupported');
  });

  it('enable asks for the permission and registers a push subscription made with the server key', async () => {
    const t = setup({ permission: 'default' });
    t.client.pushPublicKey = SERVER_KEY;
    const changes = vi.fn();
    t.alerts.onStatusChange(changes);

    expect(await t.alerts.enable()).toBe('on');
    expect(t.env.requestPermission).toHaveBeenCalledOnce();
    expect(changes).toHaveBeenCalled();
    const call = t.registration.pushManager.subscribe.mock.calls[0][0];
    expect([...call.applicationServerKey]).toEqual([...decodeBase64Url(SERVER_KEY)]);
    expect(t.subscribed).toEqual([['https://push.example/1', 'P', 'A']]);
  });

  it('re-registers on every pushConfig, replacing a subscription made with an old key', async () => {
    const t = setup();
    t.setSubscription(new Uint8Array([1, 2, 3]).buffer);
    t.emitter.emit('pushConfig', SERVER_KEY);
    await flush();
    expect(t.registration.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(t.subscribed).toEqual([['https://push.example/1', 'P', 'A']]);

    // Same key next time: the existing subscription is just re-sent.
    t.emitter.emit('pushConfig', SERVER_KEY);
    await flush();
    expect(t.registration.pushManager.subscribe).toHaveBeenCalledOnce();
    expect(t.subscribed).toHaveLength(2);
  });

  it('does not subscribe while off; disable unsubscribes and tells the server', async () => {
    const t = setup({ setting: false });
    t.emitter.emit('pushConfig', SERVER_KEY);
    await flush();
    expect(t.subscribed).toHaveLength(0);

    const on = setup();
    on.emitter.emit('pushConfig', SERVER_KEY);
    await flush();
    await on.alerts.disable();
    expect(on.alerts.status).toBe('off');
    expect(on.unsubscribed).toEqual(['https://push.example/1']);
    expect(on.getSubscription()).toBeNull();
  });

  it('words a room notification', () => {
    expect(notificationContent('Лобби', 1, { name: 'Bob', text: 'hi' })).toEqual({
      title: 'Лобби',
      body: 'Bob: hi',
    });
  });
});
