// Custom service worker additions — merged into the generated sw.js by
// @ducanh2912/next-pwa at build time. This file runs in the ServiceWorker
// scope (globalThis === ServiceWorkerGlobalScope), not in the browser.

// ── Push event ────────────────────────────────────────────────────────────────
// Triggered when the backend sends a push message via the Web Push API.
self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Xhelal Shatri Clinic', body: event.data ? event.data.text() : '' };
  }

  var title = payload.title || 'Xhelal Shatri Clinic';
  var options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-72x72.png',
    data: { url: payload.url || '/paneli' },
    tag: payload.tag || 'default',
    // Vibrate pattern for Android
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────
// Triggered when the user taps/clicks a push notification.
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : '/paneli';

  // Try to focus an existing window on the target URL, fall back to opening
  // a new one. `includeUncontrolled: true` catches tabs the SW doesn't yet
  // control (e.g., freshly installed PWA).
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
