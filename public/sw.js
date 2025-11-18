// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v19'; // (ИЗМЕНЕНО)
const urlsToCache = [
    '/',
    '/index.html?v=19', // (ИЗМЕНЕНО)
    '/style.css?v=19', // (ИЗМЕНЕНО)
    '/script.js?v=19', // (ИЗМЕНЕНО)
    '/dealer.html?v=19',
    '/dealer.js?v=19',
    '/map.html?v=19',
    '/map.js?v=19',
    '/products.html?v=19',
    '/products.js?v=19',
    '/report.html?v=19',
    '/report.js?v=19',
    '/knowledge.html?v=19',
    '/knowledge.js?v=19',
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
                console.log('Opened cache v19 and caching new files');
                return cache.addAll(urlsToCache);
            })
    );
});

// Активация (очистка старого кэша)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME]; // Оставляем только v19
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
    // Не кэшируем запросы API, только статику
    if (event.request.url.includes('/api/')) {
        return fetch(event.request);
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response; // Из кэша
                }
                // Из сети
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
