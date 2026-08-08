/* ============================================================
   LexSV AI v3.0 – Service Worker
   Caché offline + actualización automática
   ============================================================ */

const CACHE_NAME  = 'lexsv-ai-v3';
const GEMINI_HOST = 'generativelanguage.googleapis.com';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.ico',
];

// ── Instalación: precarga archivos esenciales ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// ── Activación: elimina cachés antiguas ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia Cache-First para assets, Network-Only para Gemini ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Gemini API: siempre red (nunca cachear respuestas de IA)
  if (url.hostname === GEMINI_HOST) return;

  // CDN y fuentes externas: stale-while-revalidate
  if (url.origin !== self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fresh = fetch(e.request).then(r => {
          if (r && r.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone()));
          }
          return r;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
    return;
  }

  // Assets locales: cache-first, fallback a index.html para SPA
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r && r.status === 200) {
          caches.open(CACHE_NAME).then(c => c.put(e.request, r.clone()));
        }
        return r;
      }).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

// ── Mensaje para forzar actualización ──
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
