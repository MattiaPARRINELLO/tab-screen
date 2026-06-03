const CACHE_NAME = 'tab-screen-v2';
const PRECACHE_URLS = [
  '/message.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

const HTML_URLS = ['/', '/screen', '/screen/low-end', '/index.html', '/screen.html'];

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
    .then(() => {
      // Notify all clients to reload (fresh HTML after SW update)
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) { client.postMessage({ action: 'sw-updated' }); });
      });
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API requests, external, non-GET: network only
  if (request.method !== 'GET' || !url.origin.startsWith(self.location.origin) || url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // HTML pages: network-first (always get latest)
  if (HTML_URLS.includes(url.pathname) || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, clone);
        });
        return response;
      }).catch(function() {
        return caches.match(request).then(function(cached) {
          return cached || new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then(function(cached) {
      return cached || fetch(request).then(function(response) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, clone);
        });
        return response;
      });
    })
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
