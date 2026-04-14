const CACHE_NAME = 'tienda-alem-v3';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/src/app.js',
    '/src/config/supabase.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Forza al SW a instalarse de inmediato
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    // Borrar caches antiguos (versiones viejas)
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim(); // Toma el control inmediatamente
});

self.addEventListener('fetch', (event) => {
    // Para llamadas a API (Supabase) o herramientas CDN no usamos caché de lectura rápida obligatorio
    if (event.request.url.includes('supabase.co') || event.request.url.includes('tailwindcss')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            // Intenta descargar la ultima version siempre que sea posible para actualizar
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            }).catch(() => response);

            return response || fetchPromise;
        })
    );
});
