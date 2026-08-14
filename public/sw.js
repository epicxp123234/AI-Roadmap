// public/sw.js
// Bump CACHE_VERSION on any future change so old installs self-heal instead
// of getting stuck serving a stale build.
const CACHE_VERSION = 'v2';
const CACHE_NAME = `velorn-${CACHE_VERSION}`;

self.addEventListener('install', () => {
  // Activate this worker immediately instead of waiting for all tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first: always try to fetch the freshest version. Only fall back to
// a cached response if the network request fails (e.g. genuinely offline).
// This is what the old version got backwards — it checked cache first with
// no expiry, so a device could get stuck on an old build indefinitely.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
