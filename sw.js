/* RELIC application cache. Movie storage remains an explicit, separate action. */
importScripts('./intro/film-cache.js');

const VERSION = 'film-v10-narration-20261028-public';
const SCOPE = new URL('./', self.registration.scope);
const FILM_SCOPE = new URL('intro/', SCOPE).href;
const APP_PREFIX = `relic-atlas-${encodeURIComponent(SCOPE.pathname)}-`;
const SHELL = `${APP_PREFIX}${VERSION}-shell`;
// Large, unchanged libraries and textures survive interface-only releases.
const ASSETS = `${APP_PREFIX}cesium-1.138-three-164-assets-v1`;
const local = path => new URL(path, SCOPE).href;
const FILM_ROOT = new URL('intro/assets/prologue/', SCOPE).pathname;
const MAX_ASSET_BYTES = 16 * 1024 * 1024;
const FETCH_CONCURRENCY = 3;
const EXCLUDED_PATH = /\/(?:api|auth|_auth|oauth|login|logout|signin|signout|\.netlify)(?:\/|$)/i;
const PRIVATE_QUERY = /^(?:access[_-]?token|api[_-]?key|token|key|authorization|auth|signature|secret|password)$/i;
const STATIC = /\.(?:html|css|js|mjs|json|webmanifest|jpe?g|png|svg|webp|avif|woff2?|wasm)$/i;

// First install warms only navigation documents and install identity. The
// already-open page continues loading its own resources normally, without a
// second burst of dozens of script and library requests from the worker.
const CORE = [
  'index.html', 'pages/earth.html', 'pages/terrain.html',
  'assets/manifest.webmanifest', 'assets/relic-logo-v1.png', 'assets/relic-icon-v1-192.png', 'assets/relic-icon-v1-512.png',
].map(local);

// Requested only when the visitor explicitly saves the film for offline use.
// This also covers a first visit whose early imports preceded worker control.
const OFFLINE_CORE = [
  ...CORE,
  'src/atlas/styles.css', 'src/worlds/earth.css', 'src/worlds/terrain.css', 'src/atlas/live.css',
  'src/atlas/premium.css', 'src/ui/theme.css', 'src/atlas/compact.css', 'src/atlas/relic-shell.css', 'src/worlds/relic-worlds.css',
  'intro/film-bridge.css', 'src/ui/app-settings.css', 'src/ui/navigation.css', 'src/ui/branding.css', 'src/ui/interaction-motion.css', 'assets/jules-avatar.jpg',
  'src/atlas/app.js', 'src/atlas/atlas-live.js', 'src/core/atlas-services.js', 'src/atlas/orbital-data.js', 'src/ui/theme.js',
  'src/atlas/surface-detail.js', 'src/atlas/nasa-worlds.js', 'src/worlds/earth-view.js', 'src/worlds/earth-imagery.js',
  'src/worlds/earth-terrain.js', 'src/worlds/terrain-globe.js', 'src/worlds/terrain-view.js',
  'src/core/paths.js', 'src/search/coordinateParser.js',
  'src/core/api-config.js', 'src/ui/api-settings.js', 'src/ui/api-settings.css', 'src/core/google-3d.js', 'src/core/google3d.css', 'src/search/place-search.js', 'src/search/place-search.css',
  'intro/film-bridge.js', 'src/core/world-bridge.js', 'src/ui/app-settings.js', 'src/ui/navigation.js',
  'src/ui/world-ui.js', 'src/ui/world-icons.js', 'src/worlds/world-performance.js',
  'src/ui/planet-dashboard.js', 'src/ui/planet-dashboard.css', 'src/ui/view-loading.js', 'src/ui/view-loading.css',
  'src/ui/app-sources.js', 'src/ui/app-sources.css', 'src/ui/provider-credits.js', 'src/ui/provider-credits.css', 'src/atlas/atlas-presentation.css',
  'intro/prologue-v8.js', 'intro/prologue-data-v8.js', 'intro/prologue-v8.css',
  'intro/prologue-player.css', 'intro/prologue-ending-v9.css', 'intro/prologue-typing.js', 'intro/prologue-typing.css',
  'intro/film-stream-v7.js', 'intro/film-offline.js', 'intro/film-cache.js',
  'intro/assets/vendor/hls.full.mjs', 'intro/assets/vendor/fontawesome-solid.js',
  'intro/assets/prologue/poster-v9-hd50.jpg',
  'intro/assets/prologue/sources-v9.json', 'intro/assets/prologue/encoding-v9-hd50.json',
  'vendor/three.module.js', 'vendor/OrbitControls.js',
].map(path => /^https?:/.test(path) ? path : local(path));

const pending = new Map();
let cooldownUntil = 0;
let cooldownLoaded;
let offlineWarm;
const COOLDOWN_KEY = local('__relic_host_cooldown__.json');

function belongsToApp(url) {
  return url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname)
    && !EXCLUDED_PATH.test(url.pathname)
    && ![...url.searchParams.keys()].some(key => PRIVATE_QUERY.test(key));
}
function cacheKey(request) {
  const url = new URL(typeof request === 'string' ? request : request.url);
  if (url.pathname === SCOPE.pathname) url.pathname = new URL('index.html', SCOPE).pathname;
  // Planet/coordinate parameters alter the viewer state, not its static HTML.
  if (/\.html$/i.test(url.pathname) || [...url.searchParams.keys()].every(key => key === 'v')) url.search = '';
  return url.href;
}
function immutable(url) {
  return url.pathname.startsWith(new URL('vendor/', SCOPE).pathname)
    || url.pathname.startsWith(new URL('intro/assets/vendor/', SCOPE).pathname)
    || (url.pathname.startsWith(new URL('assets/', SCOPE).pathname) && !/\.(?:json|webmanifest)$/i.test(url.pathname));
}
async function cacheable(response, url) {
  if (!response?.ok || response.redirected || response.type === 'opaque') return false;
  if (/private|no-store/i.test(response.headers.get('Cache-Control') || '')) return false;
  if (Number(response.headers.get('Content-Length') || 0) > MAX_ASSET_BYTES) return false;
  if (/text\/html/i.test(response.headers.get('Content-Type') || '')) {
    if (STATIC.test(url.pathname) && !/\.html$/i.test(url.pathname)) return false;
    return /<title>[^<]*\bRELIC\b/i.test(await response.clone().text());
  }
  return true;
}
async function remember(cache, request, response) {
  const url = new URL(typeof request === 'string' ? request : request.url);
  if (!await cacheable(response, url)) return false;
  try { await cache.put(cacheKey(request), response.clone()); return true; }
  catch { return false; } // A full cache must not interrupt online exploration.
}
async function readCooldown() {
  if (!cooldownLoaded) cooldownLoaded = (async () => {
    try {
      const saved = await (await caches.open(ASSETS)).match(COOLDOWN_KEY);
      const record = saved && await saved.json();
      if (Number.isFinite(record?.until)) cooldownUntil = Math.max(cooldownUntil, record.until);
    } catch { /* Treat missing or damaged metadata as no known cooldown. */ }
  })();
  await cooldownLoaded;
  return Math.max(0, cooldownUntil - Date.now());
}
function retryDelay(response) {
  const header = response.headers.get('Retry-After')?.trim();
  if (header && /^\d+(?:\.\d+)?$/.test(header)) return Math.max(1000, Number(header) * 1000);
  if (header) { const at = Date.parse(header); if (Number.isFinite(at)) return Math.max(1000, at - Date.now()); }
  return response.status === 503 ? 20000 : 60000;
}
async function holdRequests(response) {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + retryDelay(response));
  try {
    await (await caches.open(ASSETS)).put(COOLDOWN_KEY, new Response(JSON.stringify({ until:cooldownUntil }), { headers:{ 'Content-Type':'application/json' } }));
  } catch { /* The in-memory cooldown still applies when storage is full. */ }
}
function busyResponse(delay) {
  return new Response('RELIC is temporarily offline. Previously opened views remain available.', {
    status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8', 'Retry-After':String(Math.max(1, Math.ceil(delay / 1000))), 'Cache-Control':'no-store' },
  });
}
async function fallbackDocument(shell, request) {
  if (request.mode !== 'navigate') return null;
  return await shell.match(local('index.html')) || null;
}
async function load(request, { reload = false } = {}) {
  const url = new URL(typeof request === 'string' ? request : request.url);
  const normalized = typeof request === 'string' ? new Request(request) : request;
  const key = cacheKey(normalized);
  const shell = await caches.open(SHELL), assets = await caches.open(ASSETS);
  const cached = await (immutable(url) ? assets : shell).match(key);
  // A release has its own shell cache: immutable and mutable static resources
  // can both be reused within that release instead of revalidated on each page.
  if (cached && !reload && normalized.cache !== 'reload') return cached;
  const delay = await readCooldown();
  if (delay > 0) return cached || await fallbackDocument(shell, normalized) || busyResponse(delay);
  if (pending.has(key)) return (await pending.get(key)).clone();
  const operation = (async () => {
    try {
      const response = await fetch(normalized, { cache:reload ? 'reload' : immutable(url) ? 'default' : 'no-cache' });
      const html = /text\/html/i.test(response.headers.get('Content-Type') || '');
      const ratePage = html && /rate limit exceeded|too many requests/i.test(await response.clone().text());
      if (response.status === 429 || response.status === 503 || ratePage) {
        await holdRequests(response);
        return cached || await fallbackDocument(shell, normalized) || busyResponse(await readCooldown());
      }
      if (response.status >= 500 && cached) return cached;
      await remember(immutable(url) ? assets : shell, normalized, response);
      return response;
    } catch (error) {
      const fallback = cached || await fallbackDocument(shell, normalized);
      if (fallback) return fallback;
      throw error;
    }
  })();
  pending.set(key, operation);
  try { return (await operation).clone(); }
  finally { if (pending.get(key) === operation) pending.delete(key); }
}
async function warm(urls, reload = false) {
  let next = 0;
  const failures = [];
  await Promise.all(Array.from({ length:Math.min(FETCH_CONCURRENCY, urls.length) }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const response = await load(new Request(url, { credentials:'same-origin' }), { reload });
        const target = await caches.open(immutable(new URL(url)) ? ASSETS : SHELL);
        if (!response.ok || !await target.match(cacheKey(url))) failures.push(new URL(url).pathname);
      } catch { failures.push(new URL(url).pathname); }
    }
  }));
  return failures;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const failures = await warm(CORE);
    if (failures.length) throw new Error('The application update will wait until its navigation files are available.');
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
  if (event.data?.type === 'RELIC_FILM_OFFLINE_PING') {
    event.ports?.[0]?.postMessage({ type:'RELIC_FILM_OFFLINE_READY', version:1 });
  } else if (event.data?.type === 'RELIC_CACHE_OFFLINE_SHELL') {
    if (!offlineWarm) offlineWarm = warm(OFFLINE_CORE).finally(() => { offlineWarm = null; });
    event.waitUntil(offlineWarm.then(failures => {
      event.ports?.[0]?.postMessage(failures.length ? { ok:false, error:'Some application files are not available for offline playback.' } : { ok:true });
    }, () => event.ports?.[0]?.postMessage({ ok:false, error:'The application could not be saved offline.' })));
  }
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
  if (request.mode !== 'navigate' && !STATIC.test(url.pathname)) return;
  event.respondWith(load(request));
});
