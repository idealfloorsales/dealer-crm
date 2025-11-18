// sw.js (Service Worker)

// (ИЗМЕНЕНО) Версия 2. Меняем v1 на v2, чтобы "мозг" понял, что пора обновляться
const CACHE_NAME = 'dealer-crm-cache-v2';

// (ИЗМЕНЕНО) Добавляем ?v=20 ко всем файлам, чтобы он скачал их заново
const urlsToCache = [
    '/',
    '/index.html?v=20',
    '/style.css?v=20',
    '/script.js?v=20',
    '/dealer.html?v=20',
    '/dealer.js?v=20',
    '/map.html?v=20',
    '/map.js?v=20',
    '/products.html?v=20',
    '/products.js?v=20',
    '/report.html?v=20',
    '/report.js?v=20',
    '/knowledge.html?v=20',
    '/knowledge.js?v=20',
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
                console.log('Opened cache v2 and caching new files');
                return cache.addAll(urlsToCache);
            })
    );
});

// Активация (очистка старого кэша v1)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME]; // Оставляем только v2
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName); // Удаляем v1
                    }
                })
            );
        })
    );
});

// Перехват запросов (Fetch)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Если есть в кэше - отдаем из кэша
                if (response) {
                    return response;
                }
                // Если нет - идем в сеть, скачиваем и кэшируем
                return fetch(event.request).then(
                    response => {
                        if(!response || response.status !== 200) {
                            return response;
                        }
                        // Кэшируем только основные типы запросов
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
