const CACHE_NAME = 'tab-screen-v1';
const PRECACHE_URLS = [
  '/message.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((n) => n !== CACHE_NAME ? caches.delete(n) : null))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin) || request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          cache.put(request, clone);
        }
      });
      return response;
    }))
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'Tab Screen', body: 'Nouveau message' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch { /* use defaults */ }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tab Screen', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/message.html');
    })
  );
});
