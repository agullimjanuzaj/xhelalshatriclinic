// Custom service worker handlers for push notifications and notification clicks.
// This file is merged into the generated sw.js by @ducanh2912/next-pwa via
// the `customWorkerSrc: 'worker'` option in next.config.ts.

self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {
      title: 'Xhelal Shatri Clinic',
      body: event.data ? event.data.text() : '',
    };
  }

  var title = payload.title || 'Xhelal Shatri Clinic';
  var tag = payload.tag || 'default';
  var options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/notification-icon.png',
    badge: payload.badge || '/icons/badge.png',
    data: { url: payload.url || payload.click_action || '/paneli' },
    tag: tag,
    renotify: payload.renotify !== undefined ? payload.renotify : true,
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var url =
    event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : '/paneli';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});
