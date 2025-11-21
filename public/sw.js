// sw.js (Service Worker)

// (ВОТ ЗДЕСЬ МЕНЯЕМ ВЕРСИЮ)
const CACHE_NAME = 'dealer-crm-cache-v52'; 

const urlsToCache = [
    '/',
    '/index.html?v=51', // (И здесь тоже меняем на 45)
    '/style.css?v=51',
    '/script.js?v=52',
    '/dealer.html?v=45',
    '/dealer.js?v=45',
    '/map.html?v=45',
    '/map.js?v=45',
    '/products.html?v=45',
    '/products.js?v=45',
    '/report.html?v=45',
    '/report.js?v=45',
    '/sales.html?v=45', 
    '/sales.js?v=45',
    '/knowledge.html?v=45',
    '/knowledge.js?v=45',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Установка
self.addEventListener('install', event => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // console.log('Opened cache v45');
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});

// Активация (удаление старого кэша)
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
