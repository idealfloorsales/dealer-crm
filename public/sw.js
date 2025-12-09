const CACHE_NAME = 'dealer-crm-cache-v230'; // ВЕРСИЯ 205

const urlsToCache = [
    '/',
    '/index.html?v=230',
    '/style.css?v=230',
    '/script.js?v=230',
    '/dealer.html?v=230',
    '/dealer.js?v=230',
    '/map.html?v=230',
    '/map.js?v=230',
    '/products.html?v=230',
    '/products.js?v=230',
    '/report.html?v=230',
    '/report.js?v=230',
    '/sales.html?v=230',
    '/sales.js?v=230',
    '/competitors.html?v=230',
    '/competitors.js?v=230',
    '/knowledge.html?v=230',
    '/knowledge.js?v=230',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// УСТАНОВКА (Кэширование)
self.addEventListener('install', event => {
    self.skipWaiting(); // Заставляет немедленно активировать новый SW
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache v205');
                // addAll может упасть, если одного файла нет, поэтому используем forEach для надежности
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});

// АКТИВАЦИЯ (Удаление старого кэша)
self.addEventListener('activate', event => {
    event.waitUntil(clients.claim()); // Захватываем контроль над страницей сразу
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

// ПЕРЕХВАТ ЗАПРОСОВ
self.addEventListener('fetch', event => {
    // API запросы всегда идут в сеть, не кэшируем их
    if (event.request.url.includes('/api/')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Если есть в кэше - отдаем из кэша
                if (response) {
                    return response;
                }
                // Если нет - качаем из сети
                return fetch(event.request);
            })
    );
});
