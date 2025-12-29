const CACHE_NAME = 'dealer-crm-cache-v320'; // UPDATED VERSION
const ASSETS = [
    '/',
    '/index.html',
    '/map.html',
    '/sales.html',
    '/report.html',
    '/products.html',
    '/competitors.html',
    '/knowledge.html',
    '/dealer.html',
    '/style.css',
    '/script.js',
    '/sales.js',
    '/report.js',
    '/products.js',
    '/competitors.js',
    '/knowledge.js',
    '/dealer.js',
    '/map.js',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
    }))));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);
    const isSelf = url.origin === location.origin;
    const isCdn = url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com');
    if (!isSelf && !isCdn) return;

    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((response) => {
                if (!response || response.status !== 200 || response.type !== 'basic') return response;
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseToCache);
                });
                return response;
            }).catch(() => {});
        })
    );
});
