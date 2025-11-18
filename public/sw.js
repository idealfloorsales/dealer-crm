// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v25'; // (ИЗМЕНЕНО)
const urlsToCache = [
    '/',
    '/index.html?v=25', // (ИЗМЕНЕНО)
    '/style.css?v=25', // (ИЗМЕНЕНО)
    '/script.js?v=25', // (ИЗМЕНЕНО)
    '/dealer.html?v=25',
    '/dealer.js?v=25',
    '/map.html?v=25',
    '/map.js?v=25',
    '/products.html?v=25',
    '/products.js?v=25',
    '/report.html?v=25',
    '/report.js?v=25',
    '/knowledge.html?v=25',
    '/knowledge.js?v=25',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Установка
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache v25 and caching new files');
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});

// Активация (очистка старого кэша)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME]; // Оставляем только v25
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName); // Удаляем старый
                    }
                })
            );
        })
    );
});

// Перехват запросов (Fetch)
self.addEventListener('fetch', event => {
    // API запросы всегда идут в сеть
    if (event.request.url.includes('/api/')) {
        return fetch(event.request);
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 1. Из кэша
                if (response) {
                    return response;
                }
                
                // 2. Из сети
                return fetch(event.request).then(
                    response => {
                        if(!response || response.status !== 200) {
                            return response;
                        }
                        if (response.type === 'basic' || event.request.url.startsWith('https:')) {
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
