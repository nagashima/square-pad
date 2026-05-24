'use strict';

const CACHE_VERSION = 'v2';
const CACHE_NAME = `square-${CACHE_VERSION}`;
const SHARE_CACHE = 'square-share-target';
const SHARE_KEY = '/shared-image';

const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Share Target: POST 受信
  if (req.method === 'POST') {
    event.respondWith(handleShareTarget(req));
    return;
  }

  if (req.method !== 'GET') return;

  // Network-First: 同一オリジンの GET は常に最新を取りに行く
  // 失敗時のみキャッシュにフォールバック → ファイル更新が即時反映、オフラインも維持
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('image');
    const file = files.find((f) => f instanceof File);
    if (file) {
      const cache = await caches.open(SHARE_CACHE);
      const headers = new Headers({
        'Content-Type': file.type || 'application/octet-stream',
        'X-Share-Filename': encodeURIComponent(file.name || 'shared'),
      });
      await cache.put(SHARE_KEY, new Response(file, { headers }));
    }
  } catch (e) {
    console.warn('Share target receive failed:', e);
  }
  return Response.redirect('./?share=1', 303);
}
