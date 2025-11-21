// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v58'; 

const urlsToCache = [
    '/',
    '/index.html?v=58', 
    '/style.css?v=58', 
    '/script.js?v=58',
    '/dealer.html?v=58',
    '/dealer.js?v=58',
    '/map.html?v=58',
    '/map.js?v=58',
    '/products.html?v=58',
    '/products.js?v=58',
    '/report.html?v=58',
    '/report.js?v=58',
    '/sales.html?v=58',
    '/sales.js?v=58',
    '/competitors.html?v=58', // (НОВОЕ)
    '/competitors.js?v=58',   // (НОВОЕ)
    '/knowledge.html?v=58',
    '/knowledge.js?v=58',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', event => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});

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
