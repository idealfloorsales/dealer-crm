// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v68'; // (ОБНОВЛЕНО)

const urlsToCache = [
    '/',
    '/index.html?v=68', // (ОБНОВЛЕНО)
    '/style.css?v=68', // (ОБНОВЛЕНО)
    '/script.js?v=68', // (ОБНОВЛЕНО)
    '/dealer.html?v=68',
    '/dealer.js?v=68',
    '/map.html?v=68',
    '/map.js?v=68',
    '/products.html?v=68',
    '/products.js?v=68',
    '/report.html?v=68',
    '/report.js?v=68',
    '/sales.html?v=68',
    '/sales.js?v=68',
    '/competitors.html?v=68',
    '/competitors.js?v=68',
    '/knowledge.html?v=68',
    '/knowledge.js?v=68',
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
