/* RELIC's application shell. Film storage is a separate, explicit download. */
importScripts('./intro/film-cache.js');

const VERSION = 'integrated-v8-4-20261025-subtitles-1';
const SCOPE = new URL('./', self.registration.scope);
const FILM_SCOPE = new URL('intro/', SCOPE).href;
const APP_PREFIX = `relic-atlas-${encodeURIComponent(SCOPE.pathname)}-`;
const SHELL = `${APP_PREFIX}${VERSION}-shell`;
const ASSETS = `${APP_PREFIX}${VERSION}-assets`;
const local = path => new URL(path, SCOPE).href;
const FILM_ROOT = new URL('intro/assets/prologue/', SCOPE).pathname;
const CORE = [
  './', 'index.html', 'earth.html', 'terrain.html', 'base_lunaire_3d.html',
  'styles.css', 'earth.css', 'terrain.css', 'lunar-base.css', 'live.css',
  'premium.css', 'theme.css', 'compact.css', 'relic-shell.css', 'relic-worlds.css',
  'api-settings.css', 'film-bridge.css',
  'app.js', 'atlas-live.js', 'theme.js', 'surface-detail.js', 'nasa-worlds.js',
  'earth-view.js', 'earth-imagery.js', 'earth-terrain.js', 'terrain-globe.js', 'terrain-view.js',
  'lunar-base.js', 'lunar-architecture.js', 'lunar-environment.js', 'lunar-physics.js',
  'api-config.js', 'api-settings.js', 'google-3d.js', 'google3d.css',
  'place-search.js', 'place-search.css', 'film-bridge.js', 'world-bridge.js',
  'intro/prologue-v8.js', 'intro/prologue-data-v8.js', 'intro/prologue-v8.css',
  'intro/film-stream-v7.js', 'intro/film-offline.js', 'intro/film-cache.js',
  'intro/assets/vendor/hls.full.mjs', 'intro/assets/vendor/fontawesome-solid.js',
  'intro/assets/prologue/poster-v8.jpg', 'intro/assets/prologue/iss-backdrop-v7.jpg',
  'intro/assets/prologue/sources-v8.json', 'intro/assets/prologue/encoding-v8.json',
  'vendor/three.module.js', 'vendor/OrbitControls.js',
  'manifest.webmanifest', 'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
].map(local);
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const EXCLUDED_PATH = /\/(?:api|auth|_auth|oauth|login|logout|signin|signout|\.netlify)(?:\/|$)/i;
const PRIVATE_QUERY = /^(?:access[_-]?token|api[_-]?key|token|key|authorization|auth|signature|secret|password)$/i;
const STATIC = /\.(?:html|css|js|mjs|json|webmanifest|jpe?g|png|svg|webp|avif|woff2?|wasm)$/i;

function belongsToApp(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)
    && !EXCLUDED_PATH.test(url.pathname)
    && ![...url.searchParams.keys()].some(key => PRIVATE_QUERY.test(key));
}
function cacheKey(request) {
  const url = new URL(typeof request === 'string' ? request : request.url);
  // Module imports carry release query parameters. Store one canonical copy,
  // so a first offline navigation can resolve the shell's exact import URLs.
  if ([...url.searchParams.keys()].every(key => key === 'v')) url.search = '';
  return url.href;
}
function immutable(url) {
  return url.pathname.startsWith(new URL('vendor/', SCOPE).pathname)
    || url.pathname.startsWith(new URL('intro/assets/vendor/', SCOPE).pathname)
    || (url.pathname.startsWith(new URL('assets/', SCOPE).pathname) && !/\.json$/i.test(url.pathname));
}
function cacheable(response, url) {
  if (!response?.ok || response.redirected || response.type === 'opaque') return false;
  if (/private|no-store/i.test(response.headers.get('Cache-Control') || '')) return false;
  if (Number(response.headers.get('Content-Length') || 0) > MAX_ASSET_BYTES) return false;
  return /\.html$/i.test(url.pathname) || !STATIC.test(url.pathname)
    || !/text\/html/i.test(response.headers.get('Content-Type') || '');
}
async function remember(cache, request, response) {
  const url = new URL(typeof request === 'string' ? request : request.url);
  if (!cacheable(response, url)) return;
  if ((response.headers.get('Content-Type') || '').includes('text/html')) {
    const html = await response.clone().text();
    if (!/<title>[^<]*\bRELIC\b/i.test(html)) return;
  }
  try { await cache.put(cacheKey(request), response.clone()); }
  catch { /* Storage pressure must not prevent exploration. */ }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.allSettled(CORE.map(async url => {
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      await remember(cache, url, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(APP_PREFIX) && ![SHELL, ASSETS].includes(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'RELIC_FILM_OFFLINE_PING')
    event.ports?.[0]?.postMessage({ type:'RELIC_FILM_OFFLINE_READY', version:1 });
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.cache === 'no-store' || request.headers.has('Authorization')) return;
  const url = new URL(request.url);
  if (!belongsToApp(url) || url.searchParams.has('no-cache')) return;
  if (url.pathname.startsWith(FILM_ROOT) && /\.(?:mp4|m4s|m3u8|aac|m4a|mp3|ogg|opus|wav)$/i.test(url.pathname)) {
    event.respondWith(self.RELICFilmCache.serve(request, FILM_SCOPE));
    return;
  }
  if (request.headers.has('Range')) return;
  const navigation = request.mode === 'navigate';
  if (!navigation && !STATIC.test(url.pathname)) return;
  event.respondWith((async () => {
    const shell = await caches.open(SHELL), assets = await caches.open(ASSETS);
    const key = cacheKey(request);
    const cached = await assets.match(key) || await shell.match(key);
    if (immutable(url) && cached) return cached;
    try {
      const response = await fetch(request, { cache:immutable(url) ? 'default' : 'no-cache' });
      if (response.status >= 500 && cached) return cached;
      await remember(immutable(url) ? assets : shell, request, response);
      return response;
    } catch (error) {
      if (cached) return cached;
      if (navigation) {
        const fallback = await shell.match(local('index.html')) || await shell.match(local('./'));
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
