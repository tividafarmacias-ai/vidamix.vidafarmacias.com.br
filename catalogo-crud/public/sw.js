// Bump this version when changing the offline page or one of its dependencies.
const CACHE_PREFIX = 'vidamix-offline-';
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [
  OFFLINE_URL,
  '/brand.css',
  '/pwa.css',
  '/js/pwa.js',
  '/branding/vida-horizontal.png',
  '/fonts/poppins-latin-400-normal.woff2',
  '/fonts/poppins-latin-600-normal.woff2',
  '/fonts/poppins-latin-700-normal.woff2',
];
const PAGE_PATHS = new Set([
  '/', '/catalogo', '/artes/stories', '/artes/feed', '/artes/indoor-h',
  '/index.html', '/catalogo.html', '/stories.html', '/feed.html', '/indoor-h.html',
  OFFLINE_URL,
]);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(OFFLINE_ASSETS.map((url) => new Request(url, {
      credentials: 'same-origin',
      cache: 'reload',
    })));
    // Let existing editing sessions finish before activating an update.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : '/';
  if (request.mode === 'navigate' && PAGE_PATHS.has(pathname)) {
    event.respondWith((async () => {
      try {
        // Never cache application pages, API responses, or authentication errors.
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })());
    return;
  }

  if (OFFLINE_ASSETS.includes(url.pathname) && !url.search) {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(url.pathname)) || Response.error();
      }
    })());
  }
});
