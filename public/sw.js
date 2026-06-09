// public/sw.js
const CACHE_NAME = 'velorn-v1';

self.addEventListener('install', () => {
  console.log('Service Worker installing...');
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
