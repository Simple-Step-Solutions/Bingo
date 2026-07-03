self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  const n = payload.notification ?? {};
  const title = n.title ?? 'Chamber Bingo';
  const body = n.body ?? '';
  const icon = n.icon ?? '/icons/icon-192.png';
  const link = payload.fcmOptions?.link ?? payload.webpush?.fcmOptions?.link ?? 'https://bingo.simplestepsolutions.com/';

  event.waitUntil(
    self.registration.showNotification(title, { body, icon, data: { link } })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow(link);
    })
  );
});
