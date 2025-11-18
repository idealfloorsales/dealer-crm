// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v27'; // (ИЗМЕНЕНО v27)
const urlsToCache = [
    '/',
    '/index.html?v=27',
    '/style.css?v=27',
    '/script.js?v=27',
    '/dealer.html?v=27',
    '/dealer.js?v=27',
    '/map.html?v=27',
    '/map.js?v=27',
    '/products.html?v=27',
    '/products.js?v=27',
    '/report.html?v=27',
    '/report.js?v=27',
    '/knowledge.html?v=27',
    '/knowledge.js?v=27',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Установка
self.addEventListener('install', event => {
    // (ВАЖНО) Заставляем новый SW активироваться немедленно, не ожидая закрытия вкладок
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache v27');
                // Используем .add для каждого файла, чтобы ошибка одного не ломала всё
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});

// Активация
self.addEventListener('activate', event => {
    // (ВАЖНО) Немедленно берем контроль над всеми открытыми вкладками
    event.waitUntil(clients.claim());

    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Перехват запросов
self.addEventListener('fetch', event => {
    // API запросы всегда в сеть
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
