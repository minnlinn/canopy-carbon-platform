'use strict';

const CACHE_NAME = 'canopy-shell-v8';
const SHELL_FILES = [
  './',
  './index.html',
  './qr.html',
  './qr-navigation.js',
  './reset-password.html',
  './style.css',
  './password-visibility.css',
  './password-visibility.js',
  './revenue.css',
  './revenue-platform.js',
  './canopy-projects.css',
  './canopy-projects.js',
  './app.js',
  './reset-password.js',
  './pwa.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];
const STATIC_PATHS = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('canopy-shell-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const fallback = url.pathname.endsWith('/qr.html') ? './qr.html' : './index.html';
      return (await cache.match(fallback)) || Response.error();
    }));
    return;
  }

  if (!STATIC_PATHS.has(url.pathname)) return;
  event.respondWith((async () => {
    const cached = await caches.match(request);
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return cached || Response.error();
    }
  })());
});