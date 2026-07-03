importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Config is injected at build time via a fetch to /__/firebase/init.json
// or hardcoded here. We fetch it dynamically so we don't duplicate secrets.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

let messagingInstance = null;

async function initMessaging() {
  if (messagingInstance) return messagingInstance;
  try {
    const resp = await fetch('/__/firebase/init.json');
    const config = await resp.json();
    if (!firebase.apps.length) firebase.initializeApp(config);
    messagingInstance = firebase.messaging();
    return messagingInstance;
  } catch {
    // Fallback: messaging won't work but SW won't crash
    return null;
  }
}

self.addEventListener('push', async (event) => {
  const messaging = await initMessaging();
  if (!messaging) {
    // Handle raw push payload directly if FCM SDK not available
    const data = event.data?.json() || {};
    const { title = 'Chamber Bingo', body = '' } = data.notification || {};
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: data.data || {},
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});
