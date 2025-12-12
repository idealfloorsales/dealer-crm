const CACHE_NAME = 'dealer-crm-v1.1'; 
const ASSETS = [ '/', '/index.html', '/main.js', '/style.css', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js', 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css' ];

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => k!==CACHE_NAME && caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => { 
    if(e.request.method!=='GET' || !e.request.url.startsWith('http')) return;
    e.respondWith(caches.match(e.request).then(c => c || fetch(e.request).then(r => { 
        if(r.status===200) caches.open(CACHE_NAME).then(cache => cache.put(e.request, r.clone())); 
        return r; 
    }).catch(()=>{}))); 
});
