const CACHE_NAME = '2euro-tracker-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/data.json',
    '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => {
            return cache.addAll(ASSETS);
        })
    );
});

// Fetch events
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
        .then(response => {
            // Return cached version or fetch from network
            return response || fetch(event.request);
        })
    );
});
