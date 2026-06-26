const CACHE_NAME = 'laphiny-runtime-v3';

function scopePath() {
  try {
    return new URL(self.registration.scope).pathname || '/';
  } catch {
    return '/laphiny/';
  }
}

const BASE_PATH = scopePath();
const OFFLINE_URL = `${BASE_PATH}offline.html`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([BASE_PATH, OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, true));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, navigation) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request) || await cache.match(BASE_PATH);
    if (cached) return cached;
    if (navigation) return cache.match(OFFLINE_URL);
    throw new Error('Laphiny offline cache miss');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    refresh.catch(() => undefined);
    return cached;
  }

  const response = await refresh;
  if (response) return response;
  throw new Error('Laphiny offline cache miss');
}
