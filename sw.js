const CACHE_NAME = 'tienda-alem-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/src/app.js',
    '/src/config/supabase.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Para llamadas a API (Supabase) o herramientas CDN no usamos caché de lectura rápida obligatorio
    if (event.request.url.includes('supabase.co') || event.request.url.includes('tailwindcss')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
