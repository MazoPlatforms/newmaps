const APP_CACHE = 'mazo-app-shell-v2';
const SHELL = ['./', './index.html', './assets/css/site.css?v=phase12-14-1', './assets/js/app.js?v=phase12-14-navigation-offline-1', './assets/js/search-engine.mjs', './assets/js/place-delivery.mjs', './assets/js/map-presentation.mjs?v=phase9-cartography-1', './assets/js/cartographic-style.mjs?v=phase9-basemap-audit-1', './assets/js/routing-graph.mjs', './assets/js/offline-pack.mjs', './assets/vendor/pmtiles-4.5.0.js', './assets/vendor/maplibre-gl-5.7.0/maplibre-gl.js', './assets/vendor/maplibre-gl-5.7.0/maplibre-gl.css'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await Promise.all(SHELL.map(async (url) => {
      try { const response = await fetch(url); if (response.ok) await cache.put(url, response); } catch { /* App shell remains usable online; install can proceed. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('mazo-app-shell-') && key !== APP_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.headers.has('range') && url.origin === self.location.origin) {
    event.respondWith((async () => {
      for (const name of await caches.keys()) {
        if (!name.startsWith('mazo-offline-pack-')) continue;
        const cached = await (await caches.open(name)).match(request.url);
        if (!cached) continue;
        const blob = await cached.blob();
        const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get('range') || '');
        if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
        if (start > end || start >= blob.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
        return new Response(blob.slice(start, end + 1), { status: 206, headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${blob.size}`, 'Content-Length': String(end - start + 1), 'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream' } });
      }
      return fetch(request);
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    for (const name of await caches.keys()) {
      if (!name.startsWith('mazo-offline-pack-')) continue;
      const cached = await (await caches.open(name)).match(request.url);
      if (cached) return cached;
    }
    const appCache = await caches.open(APP_CACHE);
    const cachedShell = await appCache.match(request.url, { ignoreSearch: true })
      || (url.pathname.endsWith('/') ? await appCache.match(new URL('index.html', self.registration.scope).href) : null);
    if (cachedShell) return cachedShell;
    try {
      const response = await fetch(request);
      if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs') || url.pathname.endsWith('.css'))) await appCache.put(request, response.clone());
      return response;
    } catch {
      return new Response('This resource is not available in the downloaded offline area.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
