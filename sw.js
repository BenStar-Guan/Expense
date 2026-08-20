// ===== Service Worker — 消费记账 PWA (Full) =====
const CACHE_NAME = 'expense-tracker-v10';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Noto+Sans+SC:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap',
  'https://unpkg.com/dexie@4.0.8/dist/dexie.min.js',
];

// ===== Install — pre-cache core assets =====
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ===== Activate — clean old caches, take control immediately =====
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== Fetch =====
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never intercept non-GET requests (IndexedDB ops)
  if (e.request.method !== 'GET') return;

  // Skip chrome-extension requests
  if (url.protocol === 'chrome-extension:') return;

  // HTML files: NETWORK-FIRST (always get latest version)
  const isHTML = e.request.mode === 'navigate'
    || url.pathname.endsWith('.html')
    || url.pathname === '/'
    || url.pathname === '';

  if (isHTML) {
    e.respondWith(
      fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => {
        // Offline: serve cached page
        return caches.match(e.request).then(cached => {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // CDN resources: cache-first, fall back to network
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return resp;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // Other same-origin (icons, manifest, etc): cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ===== Message — handle update / skipWaiting =====
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ===== Periodic Sync (background cache refresh) =====
self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'refresh-cache') {
    e.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        return Promise.allSettled(
          ASSETS.map(url => cache.add(url).catch(() => {}))
        );
      })
    );
  }
});
