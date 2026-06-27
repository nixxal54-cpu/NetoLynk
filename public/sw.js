const CACHE_NAME = 'netolynk-v1';
const urlsToCache = [
  '/',
  '/index.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // ✅ Only cache GET requests to same origin — skip everything else
  // POST/PUT/DELETE and cross-origin requests (like Cloudinary, Firebase)
  // must go directly to the network without SW interference
  if (
    request.method !== 'GET' ||
    !request.url.startsWith(self.location.origin)
  ) {
    return; // Let browser handle it natively — no event.respondWith()
  }

  event.respondWith(
    caches.match(request).then((response) => response || fetch(request))
  );
});
