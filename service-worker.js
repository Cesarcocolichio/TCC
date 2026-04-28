const CACHE_NAME = 'monitor-v2'; // Mudei para v2 para forçar limpeza
const urlsToCache = [
  '/TCC/',
  '/TCC/index.html',
  '/TCC/style.css',
  '/TCC/script.js',
  '/TCC/manifest.json',
  '/TCC/icon-192.png',
  '/TCC/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting(); // Força o novo SW a assumir o controle imediatamente
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estratégia Network-First: Tenta a rede, se falhar (offline), usa o cache.
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Se a rede funcionar, clona e salva no cache para uso offline posterior
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => caches.match(event.request)) // Se falhar a rede, entrega o cache
  );
});