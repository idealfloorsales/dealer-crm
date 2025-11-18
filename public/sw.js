// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v28'; // (ИЗМЕНЕНО)
const urlsToCache = [
    '/',
    '/index.html?v=28', // (ИЗМЕНЕНО)
    '/style.css?v=28',
    '/script.js?v=28',
    '/dealer.html?v=28',
    '/dealer.js?v=28',
    '/map.html?v=28',
    '/map.js?v=28',
    '/products.html?v=28',
    '/products.js?v=28',
    '/report.html?v=28',
    '/report.js?v=28',
    '/knowledge.html?v=28',
    '/knowledge.js?v=28',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];
// ... (дальше код без изменений, как в предыдущем ответе) ...
// Установка
self.addEventListener('install', event => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache v28');
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});
// Активация
self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
// Fetch
self.addEventListener('fetch', event => {
    if (event.request.url.includes('/api/')) {
        return fetch(event.request);
    }
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) return response;
                return fetch(event.request);
            })
    );
});
