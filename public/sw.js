// {{VER}} заменяется сервером при каждом запуске приложения.
const CACHE_NAME = 'dealer-crm-cache-v{{VER}}';

const LOCAL_ASSETS = [
    '/',
    '/index.html',
    '/map.html',
    '/sales.html',
    '/report.html',
    '/products.html',
    '/competitors.html',
    '/knowledge.html',
    '/reclamations.html',
    '/users.html',
    '/dealer.html',
    '/workshop.html',
    '/pricing.html',
    '/login.html',
    '/manifest.json',
    '/style.css?v={{VER}}',
    '/ui-motion.css?v={{VER}}',
    '/script.js?v={{VER}}',
    '/sales.js?v={{VER}}',
    '/report.js?v={{VER}}',
    '/products.js?v={{VER}}',
    '/competitors.js?v={{VER}}',
    '/knowledge.js?v={{VER}}',
    '/reclamations.js?v={{VER}}',
    '/permissions.js?v={{VER}}',
    '/dealer-score.js?v={{VER}}',
    '/dealer.js?v={{VER}}',
    '/map.js?v={{VER}}',
    '/workshop.js?v={{VER}}',
    '/workshop.css?v={{VER}}',
    '/pricing.js?v={{VER}}',
    '/pricing.css?v={{VER}}',
    '/logo.png',
    '/favicon.gif'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            // Кэшируем локальные файлы независимо: один неудачный ресурс
            // не должен ломать установку всего service worker.
            await Promise.allSettled(
                LOCAL_ASSETS.map(asset => cache.add(asset))
            );
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
        )
    );
    self.clients.claim();
});

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return (await caches.match(request)) || Response.error();
    }
}

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.ok && new URL(request.url).origin === self.location.origin) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return Response.error();
    }
}

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // API никогда не кэшируем: там персональные и коммерческие данные.
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Внешние CDN не кладём в наш application cache.
    if (url.origin !== self.location.origin) {
        return;
    }

    // HTML/navigation всегда сначала берём из сети.
    // Это не позволяет старой разметке переживать новый деплой.
    const isNavigation =
        event.request.mode === 'navigate' ||
        event.request.destination === 'document' ||
        url.pathname === '/' ||
        url.pathname.endsWith('.html');

    if (isNavigation) {
        event.respondWith(networkFirst(event.request));
        return;
    }

    // Версионированную локальную статику можно безопасно брать из кэша.
    event.respondWith(cacheFirst(event.request));
});
