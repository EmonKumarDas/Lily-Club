// App-shell-only Service Worker: API & uploaded receipts are NEVER cached.
// Supports instant update activation (SKIP_WAITING) and logout cache purging (CLEAR_ALL_CACHES).
const CACHE = 'lilycc-shell-v2';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (e.data && e.data.type === 'CLEAR_ALL_CACHES') {
    e.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    );
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (
    req.method !== 'GET' ||
    url.origin !== location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/')
  ) {
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('/')))
  );
});
