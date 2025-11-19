// sw.js (Service Worker)
const CACHE_NAME = 'dealer-crm-cache-v36'; // Обновили версию
const urlsToCache = [
    '/',
    '/index.html?v=36',
    '/style.css?v=36',
    '/script.js?v=36',
    '/dealer.html?v=36',
    '/dealer.js?v=36',
    '/map.html?v=36',
    '/map.js?v=36',
    '/products.html?v=36',
    '/products.js?v=36',
    '/report.html?v=36',
    '/report.js?v=36',
    '/knowledge.html?v=36',
    '/knowledge.js?v=36',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Установка (Кэширование)
self.addEventListener('install', event => {
    // Заставляем новый SW активироваться немедленно
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache v36');
                // Кэшируем каждый файл отдельно, чтобы ошибка одного не ломала всё
                urlsToCache.forEach(url => {
                    cache.add(url).catch(err => console.warn(`Failed to cache ${url}`, err));
                });
            })
    );
});

// Активация (Очистка старого)
self.addEventListener('activate', event => {
    // Немедленно берем контроль над страницей
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
    // API запросы всегда идут в сеть (не кэшируем данные)
    if (event.request.url.includes('/api/')) {
        return fetch(event.request);
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 1. Если есть в кэше - отдаем
                if (response) {
                    return response;
                }
                
                // 2. Если нет - качаем из сети
                return fetch(event.request).then(
                    response => {
                        // Проверка на валидность ответа
                        if(!response || response.status !== 200) {
                            return response;
                        }

                        // Кэшируем новые файлы на лету (если это статика)
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
