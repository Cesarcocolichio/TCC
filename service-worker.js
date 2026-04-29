const CACHE_NAME = 'monitor-v4'; // Versão 4 para forçar atualização
const urlsToCache = [
  '/TCC/',
  '/TCC/index.html',
  '/TCC/style.css',
  '/TCC/script.js',
  '/TCC/notifications.js',
  '/TCC/manifest.json',
  '/TCC/icon-192.png',
  '/TCC/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ESTRATÉGIA DE REDE
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ESCUTAR O CLIQUE NA NOTIFICAÇÃO
self.addEventListener('notificationclick', event => {
  event.notification.close(); // Fecha a notificação ao clicar

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Se o app já estiver aberto, foca nele
      for (const client of clientList) {
        if (client.url.includes('/TCC/') && 'focus' in client) {
          return client.focus();
        }
      }
      // Se não estiver aberto, abre o app
      if (clients.openWindow) {
        return clients.openWindow('/TCC/');
      }
    })
  );
});