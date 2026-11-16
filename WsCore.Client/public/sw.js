// WAVE service worker: makes the site installable as an app and shows Web Push
// notifications about chat messages (sent by the server while the user is away or
// offline — see WsServer/WsServer/Push/PushService.cs and src/app/ChatAlerts.ts).
//
// Plain JS served as-is from /sw.js (not bundled). No fetch handler on purpose: the app
// needs the network anyway (one WebSocket), and a pass-through handler only adds latency.

const TAG_PREFIX = 'chat-';
const APP_ICON = '/icons/icon-192.png';
const BADGE_ICON = '/icons/badge-96.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  event.waitUntil(showPush(data));
});

async function showPush(data) {
  if (!data || data.type !== 'chat') {
    // A push must always show something (userVisibleOnly).
    await self.registration.showNotification('WAVE', { body: 'Новые сообщения', icon: APP_ICON });
    return;
  }

  // One notification per room: a new message replaces it and the count goes up
  // (the page does the same for the notifications it shows — ChatAlerts.notificationContent).
  const tag = TAG_PREFIX + data.roomId;
  const previous = (await self.registration.getNotifications({ tag }))[0];
  const count = ((previous && previous.data && previous.data.count) || 0) + 1;
  const roomName = data.roomName || data.roomId;

  await self.registration.showNotification(count > 1 ? `${roomName} · ${count} новых` : roomName, {
    body: `${data.author}: ${data.body}`,
    tag,
    renotify: count === 1,
    icon: data.avatar ? new URL(data.avatar, self.location.origin).href : APP_ICON,
    badge: BADGE_ICON,
    timestamp: data.sentAtMs || Date.now(),
    data: { roomId: data.roomId, count },
  });
  await updateAppBadge();
}

// The installed app's icon shows how many messages the notifications stand for.
async function updateAppBadge() {
  if (!('setAppBadge' in self.navigator)) return;
  const notifications = await self.registration.getNotifications();
  const total = notifications
    .filter(n => n.tag.startsWith(TAG_PREFIX))
    .reduce((sum, n) => sum + ((n.data && n.data.count) || 0), 0);
  try {
    if (total > 0) await self.navigator.setAppBadge(total);
    else await self.navigator.clearAppBadge();
  } catch {
    /* not allowed here */
  }
}

self.addEventListener('notificationclose', event => event.waitUntil(updateAppBadge()));

// Click: focus an open window of the app (and switch it to the message's room), or open one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const roomId = event.notification.data && event.notification.data.roomId;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find(w => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if (roomId) open.postMessage({ type: 'open-room', roomId });
      } else {
        await self.clients.openWindow('/');
      }
      await updateAppBadge();
    })()
  );
});
