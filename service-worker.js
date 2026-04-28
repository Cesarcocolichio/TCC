const CACHE_NAME = 'monitor-v1';
const urlsToCache = [
  '/TCC/',
  '/TCC/index.html',
  '/TCC/style.css',
  '/TCC/script.js',
  '/TCC/manifest.json',
  '/TCC/icon-192.png',
  '/TCC/icon-512.png'
];
// ... restante do código igual

// Instalação do Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercepta as requisições para entregar do cache se estiver offline (Base do PWA)
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// Atualiza o cache quando mudar versão
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});