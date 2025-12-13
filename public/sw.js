const CACHE_NAME = 'dealer-crm-cache-v1003'; // НОВАЯ ВЕРСИЯ

// Список файлов, которые нужно закэшировать
const ASSETS = [
    '/',
    '/index.html',
    '/main.js',          // ВАЖНО: Новый файл скрипта
    '/style.css',
    '/map.html', '/map.js',
    '/sales.html', '/sales.js',
    '/report.html', '/report.js',
    '/products.html', '/products.js',
    '/competitors.html', '/competitors.js',
    '/knowledge.html', '/knowledge.js',
    '/dealer.html', '/dealer.js',
    '/logo.png',
    '/favicon.gif',
    // Внешние библиотеки (Bootstrap, Leaflet)
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// 1. Установка: Кэшируем файлы
self.addEventListener('install', (e) => {
    // skipWaiting заставляет новый SW активироваться немедленно, не дожидаясь закрытия вкладок
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Caching all assets');
            return cache.addAll(ASSETS);
        })
    );
});

// 2. Активация: Удаляем старые кэши (ОЧЕНЬ ВАЖНО ДЛЯ ВАС)
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Deleting old cache:', key);
                    return caches.delete(key);
                }
            })
        ))
    );
    // clients.claim() заставляет SW немедленно взять под контроль открытые страницы
    return self.clients.claim();
});

// 3. Перехват запросов
self.addEventListener('fetch', (e) => {
    // Игнорируем запросы, которые не GET (POST, PUT, DELETE идут напрямую в сеть)
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);

    // Игнорируем аналитику и трекеры (чтобы не было ошибок в консоли)
    if (url.hostname.includes('gtmpx.com') || url.hostname.includes('google-analytics')) {
        return;
    }

    // Стратегия: Cache First, falling back to Network (Сначала кэш, потом сеть)
    e.respondWith(
        caches.match(e.request).then((cached) => {
            // Если файл есть в кэше — отдаем его
            if (cached) return cached;

            // Если нет — качаем из сети
            return fetch(e.request).then((response) => {
                // Проверяем валидность ответа
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    // Разрешаем кэшировать ответы от CDN (type: cors)
                    const isCdn = url.hostname.includes('jsdelivr') || url.hostname.includes('unpkg');
                    if (!isCdn) return response;
                }

                // Кэшируем новый файл на будущее
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseToCache);
                });

                return response;
            }).catch(() => {
                // Здесь можно вернуть заглушку для офлайна, если сети нет и в кэше нет
            });
        })
    );
});
