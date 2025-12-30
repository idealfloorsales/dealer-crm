// {{VER}} заменится сервером автоматически
const CACHE_NAME = 'dealer-crm-cache-v{{VER}}'; 

// Статические файлы кэшируем жестко (они обновляются только при смене версии)
const ASSETS = [
    '/',
    '/index.html',
    '/map.html',
    '/sales.html',
    '/report.html',
    '/products.html',
    '/competitors.html',
    '/knowledge.html',
    '/dealer.html',
    // ВАЖНО: Добавлена версия к файлам, чтобы совпадать с HTML
    '/style.css?v={{VER}}',
    '/script.js?v={{VER}}',
    '/sales.js?v={{VER}}',
    '/report.js?v={{VER}}',
    '/products.js?v={{VER}}',
    '/competitors.js?v={{VER}}',
    '/knowledge.js?v={{VER}}',
    '/dealer.js?v={{VER}}',
    '/map.js?v={{VER}}',
    '/logo.png',
    '/favicon.gif',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
    // При установке сразу кэшируем статику
    e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    // Удаляем старые кэши
    e.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
    }))));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    const url = new URL(e.request.url);

    // СТРАТЕГИЯ 1: API (ДАННЫЕ) -> Network First (Сначала сеть, потом кэш)
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(e.request)
                .then((response) => {
                    // Копия ответа в кэш на случай офлайна
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
                    return response;
                })
                .catch(() => {
                    // Если сети нет, берем из кэша
                    return caches.match(e.request);
                })
        );
        return;
    }

    // СТРАТЕГИЯ 2: СТАТИКА -> Cache First (Сначала кэш, потом сеть)
    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((response) => {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseToCache);
                });
                return response;
            }).catch(() => {});
        })
    );
});
