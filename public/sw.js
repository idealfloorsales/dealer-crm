// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v98'; // (ОБНОВЛЕНО)

const urlsToCache = [
    '/',
    '/index.html?v=98', // (ОБНОВЛЕНО)
    '/style.css?v=98', // (ОБНОВЛЕНО)
    '/script.js?v=98', // (ОБНОВЛЕНО)
    '/dealer.html?v=98',
    '/dealer.js?v=98',
    '/map.html?v=98',
    '/map.js?v=98',
    '/products.html?v=98',
    '/products.js?v=98',
    '/report.html?v=98',
    '/report.js?v=98',
    '/sales.html?v=98',
    '/sales.js?v=98',
    '/competitors.html?v=98',
    '/competitors.js?v=98',
    '/knowledge.html?v=98',
    '/knowledge.js?v=98',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Установка (Кэширование)
self.addEventListener('install', event => {
    self.skipWaiting(); 
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // console.log('Opened cache v68');
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});

// Активация (Очистка старого)
self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        // console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Перехват запросов
self.addEventListener('fetch', event => {
    if (event.request.url.includes('/api/')) {
        return fetch(event.request);
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).then(
                    response => {
                        if(!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        // Кэшируем новые файлы на лету (кроме API)
                        if (event.request.url.startsWith('http')) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return response;
                    }
                );
            })
    );
});
