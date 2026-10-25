import './film-cache.js';

const { PREFIX, REGISTRY, readyURL } = globalThis.RELICFilmCache;
const SCOPE = new URL('./', import.meta.url).href;
const MEDIA_ROOT = new URL('assets/prologue/', SCOPE);
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const active = new Map();
const plans = new Map();
const listeners = new Set();

export class OfflineFilmError extends Error {
  constructor(code, message, detail) { super(message); this.name = 'OfflineFilmError'; this.code = code; this.detail = detail; }
}
const failure = (code, message, detail) => new OfflineFilmError(code, message, detail);
const abortError = () => new DOMException('The film download was cancelled.', 'AbortError');
const supported = () => Boolean(globalThis.isSecureContext && globalThis.caches && globalThis.crypto?.subtle && navigator.serviceWorker);
const checkAbort = signal => { if (signal?.aborted) throw abortError(); };
const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
const digest = async value => hex(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value));
const mediaKey = media => String(media.offline?.id || media.encoding || media.hls || media.src || '');
const metadataURL = media => media.encoding && new URL(media.encoding, SCOPE).href;
const recordURL = async key => new URL(`__relic_film_offline__/records/${await digest(key)}.json`, SCOPE).href;
const emit = value => { for (const listener of listeners) { try { listener(value); } catch { /* UI observers cannot interrupt a download. */ } } };
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

function localURL(value, base = SCOPE) {
  const url = new URL(value, base);
  if (url.origin !== MEDIA_ROOT.origin || !url.pathname.startsWith(MEDIA_ROOT.pathname) || url.search || url.hash)
    throw failure('invalid-manifest', 'Offline film assets must be local, versioned media files.');
  if (!/\.(?:mp4|m4s|m3u8|aac|mp3|m4a|ogg|opus|wav|json|jpe?g|png|webp|avif)$/i.test(url.pathname))
    throw failure('invalid-manifest', 'The offline manifest contains an unsupported file.');
  return url.href;
}
function safeResponse(response) {
  return response.status === 200 && !response.redirected && response.type !== 'opaque'
    && !/text\/html|application\/xhtml\+xml/i.test(response.headers.get('Content-Type') || '')
    && !/(?:^|,)\s*no-store\b/i.test(response.headers.get('Cache-Control') || '');
}
function fileRecord(input, base) {
  const value = typeof input === 'string' ? { src: input } : input;
  const url = localURL(value.url || value.src || value.path, base);
  const bytes = Number(value.bytes), sha256 = String(value.sha256 || '').toLowerCase();
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > MAX_FILE_BYTES || !/^[a-f0-9]{64}$/.test(sha256))
    throw failure('invalid-manifest', 'Every offline file needs a bounded size and a SHA-256 checksum.', { url });
  return { url, bytes, sha256 };
}
async function readRegistry(key) {
  const registry = await caches.open(REGISTRY), response = await registry.match(await recordURL(key));
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}
function ownRecord(record) {
  return record?.scope === SCOPE && typeof record.key === 'string'
    && typeof record.cacheName === 'string' && record.cacheName.startsWith(PREFIX)
    && typeof record.fingerprint === 'string' && Array.isArray(record.files);
}
async function storedEditions() {
  const registry = await caches.open(REGISTRY), editions = [];
  const directory = new URL('__relic_film_offline__/records/', SCOPE).href;
  for (const request of await registry.keys()) {
    if (!request.url.startsWith(directory)) continue;
    const response = await registry.match(request);
    if (!response) continue;
    try {
      const record = await response.json();
      if (ownRecord(record)) editions.push({ request, record });
    } catch { /* An unreadable record never grants access to another cache. */ }
  }
  return { registry, editions };
}
async function hasReadyMarker(record) {
  if (!ownRecord(record) || !record.complete) return false;
  if (!(await caches.keys()).includes(record.cacheName)) return false;
  const cache = await caches.open(record.cacheName), marker = await cache.match(readyURL(SCOPE));
  if (!marker) return false;
  let checked;
  try { checked = await marker.json(); } catch { return false; }
  return checked.complete === true && checked.scope === SCOPE
    && checked.cacheName === record.cacheName && checked.fingerprint === record.fingerprint;
}
async function removeStoredEditions({ keepCacheName = null, currentKey = null } = {}) {
  const { registry, editions } = await storedEditions();
  for (const { request, record } of editions) {
    if (record.cacheName === keepCacheName) continue;
    // Other in-progress editions have no complete registry record and must be left alone.
    // The explicitly removed current entry may also be an evicted/broken save.
    if (record.key !== currentKey && record.complete !== true) continue;
    await caches.delete(record.cacheName);
    await registry.delete(request);
    plans.delete(record.key);
  }
}
async function readMetadata(url, signal) {
  const response = await fetch(url, { credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal });
  if (!safeResponse(response)) throw failure('unavailable', 'The film manifest is unavailable.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > 1024 * 1024) throw failure('invalid-manifest', 'The film manifest is too large.');
  let encoding;
  try { encoding = JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw failure('invalid-manifest', 'The film manifest is not valid JSON.'); }
  return { encoding, record: { url, bytes: buffer.byteLength, sha256: await digest(buffer) } };
}

async function resolvePlan(media, signal) {
  const key = mediaKey(media);
  if (!key) throw failure('invalid-manifest', 'This film has no offline identity.');
  if (plans.has(key)) return plans.get(key);
  const promise = (async () => {
    const url = metadataURL(media);
    let encoding = null, manifestRecord = null;
    if (url) ({ encoding, record: manifestRecord } = await readMetadata(localURL(url), signal));
    const base = url || SCOPE, files = new Map();
    const add = (input, relativeTo = base) => { const file = fileRecord(input, relativeTo); const previous = files.get(file.url); if (previous && (previous.sha256 !== file.sha256 || previous.bytes !== file.bytes)) throw failure('invalid-manifest', 'Conflicting offline file records.'); files.set(file.url, file); };
    for (const input of media.offline?.files || encoding?.offline?.files || []) add(input);
    for (const input of encoding?.hls?.files || []) add(input);
    for (const input of Object.values(encoding?.fallbacks || {})) add(input, SCOPE);
    if (encoding?.fallback) add({ ...encoding.fallback, src: encoding.fallback.src || media.src }, SCOPE);
    else if (!encoding?.fallbacks && media.src && encoding?.bytes && encoding?.sha256) add({ src: media.src, bytes: encoding.bytes, sha256: encoding.sha256 }, SCOPE);
    for (const input of Object.values(media.narration || {})) if (input?.src) add(input, SCOPE);
    for (const input of media.offline?.extra || []) add(input, SCOPE);
    if (encoding?.poster?.bytes && encoding.poster.sha256) add({ ...encoding.poster, src: media.poster || encoding.poster.src || encoding.poster.path }, media.poster ? SCOPE : base);
    if (manifestRecord) add(manifestRecord);
    if (files.size < 2) throw failure('invalid-manifest', 'The offline manifest does not describe a complete film.');
    const ordered = [...files.values()].sort((a, b) => a.url.localeCompare(b.url));
    const fingerprint = await digest(JSON.stringify({ key, files: ordered }));
    return { key, scope: SCOPE, fingerprint, cacheName: PREFIX + fingerprint.slice(0, 32), files: ordered,
      bytes: ordered.reduce((sum, file) => sum + file.bytes, 0), languages: ['en', 'fr'], complete: false };
  })();
  plans.set(key, promise);
  try { return await promise; }
  catch (error) { plans.delete(key); throw error; }
}

async function hasCompleteFiles(record) {
  if (!await hasReadyMarker(record)) return false;
  const cache = await caches.open(record.cacheName);
  for (const file of record.files) {
    const response = await cache.match(file.url);
    if (!response || Number(response.headers.get('Content-Length')) !== file.bytes) return false;
  }
  return true;
}
async function workerAvailable() {
  if (!navigator.serviceWorker.controller) return false;
  const channel = new MessageChannel();
  return new Promise(resolve => {
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 1500);
    channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.type === 'RELIC_FILM_OFFLINE_READY' && event.data.version === 1); };
    navigator.serviceWorker.controller.postMessage({ type: 'RELIC_FILM_OFFLINE_PING' }, [channel.port2]);
  });
}

export async function getStatus(media) {
  if (!supported()) return { state: 'unsupported', supported: false, ready: false, bytes: 0 };
  const key = mediaKey(media), inProgress = active.get(key);
  if (inProgress) return { ...inProgress.status, supported: true, ready: false };
  const candidate = await readRegistry(key), saved = ownRecord(candidate) ? candidate : null;
  let plan = null;
  if (navigator.onLine !== false) { try { plan = await resolvePlan(media); } catch { /* Saved files remain inspectable without a connection. */ } }
  const current = saved && (!plan || saved.fingerprint === plan.fingerprint);
  const ready = Boolean(current && await hasCompleteFiles(saved));
  const { editions } = await storedEditions();
  const older = new Map(editions.filter(({record}) => record.complete
    && (!ready || record.cacheName !== saved.cacheName)).map(({record}) => [record.cacheName, record]));
  const previousBytes = [...older.values()].reduce((sum, record) => sum + Math.max(0, Number(record.bytes) || 0), 0);
  const prior = [...older.values()].sort((a,b) => String(b.downloadedAt || '').localeCompare(String(a.downloadedAt || '')))[0];
  let storage = {};
  try { storage = await navigator.storage?.estimate() || {}; } catch { /* Estimates are advisory. */ }
  return { state: ready ? 'ready' : saved || older.size ? 'stale' : 'not-downloaded', supported: true, ready,
    removable: editions.some(({record}) => record.key === key || record.complete === true), previousBytes,
    bytes: plan?.bytes || saved?.bytes || prior?.bytes || 0, files: plan?.files.length || saved?.files?.length || prior?.files?.length || 0,
    languages: ['en', 'fr'], downloadedAt: saved?.downloadedAt || prior?.downloadedAt || null,
    fingerprint: plan?.fingerprint || saved?.fingerprint || null,
    storage: { usage: storage.usage || 0, quota: storage.quota || 0 },
    controlled: Boolean(navigator.serviceWorker.controller) };
}
export async function canPlayOffline(media) {
  const status = await getStatus(media);
  return status.ready && await workerAvailable();
}

async function verifiedResponse(file, signal, progress) {
  checkAbort(signal);
  const response = await fetch(file.url, { credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', signal });
  if (!safeResponse(response)) throw failure('unavailable', 'A film file is unavailable.', { url: file.url });
  const expectedHeader = response.headers.get('Content-Length');
  // Fetch exposes decoded bytes; a CDN's Content-Length may describe gzip/br.
  // The bounded decoded count and SHA-256 below remain authoritative.
  const encoded = response.headers.get('Content-Encoding');
  if ((!encoded || encoded === 'identity') && expectedHeader && Number(expectedHeader) !== file.bytes) throw failure('integrity', 'A film file has the wrong size.', { url: file.url });
  const reader = response.body?.getReader(), chunks = [];
  let count = 0;
  if (reader) {
    try {
      while (true) {
        checkAbort(signal);
        const value = await reader.read();
        if (value.done) break;
        count += value.value.byteLength;
        if (count > file.bytes) { reader.cancel().catch(() => {}); throw failure('integrity', 'A film file is larger than expected.'); }
        chunks.push(value.value); progress(count);
      }
    } catch (error) { reader.cancel().catch(() => {}); throw error; }
  } else { const buffer = await response.arrayBuffer(); chunks.push(new Uint8Array(buffer)); count = buffer.byteLength; progress(count); }
  checkAbort(signal);
  if (count !== file.bytes) throw failure('integrity', 'A film download ended before the file was complete.', { url: file.url });
  const blob = new Blob(chunks), buffer = await blob.arrayBuffer();
  if (await digest(buffer) !== file.sha256) throw failure('integrity', 'A film checksum did not match.', { url: file.url });
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding'); headers.delete('Content-Range'); headers.delete('Transfer-Encoding');
  headers.set('Content-Length', String(file.bytes)); headers.set('Accept-Ranges', 'bytes');
  return new Response(blob, { status: 200, headers });
}

export function download(media, { signal, onProgress = () => {} } = {}) {
  const key = mediaKey(media);
  if (active.has(key)) return active.get(key).promise;
  const controller = new AbortController(), forwardAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });
  const entry = { controller, status: { state: 'preparing', key, ready: false, bytesDone: 0, totalBytes: 0, filesDone: 0, totalFiles: 0, percent: 0 } };
  const notify = value => { entry.status = { ...entry.status, ...value }; try { onProgress(entry.status); } catch { /* Rendering cannot interrupt the transfer. */ } emit(entry.status); };
  entry.promise = Promise.resolve().then(async () => {
    if (!supported()) throw failure('unsupported', 'Offline film storage is not supported by this browser.');
    checkAbort(controller.signal);
    if (!await workerAvailable()) throw failure('worker-not-ready', 'Reload the application before downloading this film.');
    const previous = await readRegistry(key), plan = await resolvePlan(media, controller.signal);
    if (previous?.fingerprint === plan.fingerprint && await hasCompleteFiles(previous)) {
      try { await removeStoredEditions({ keepCacheName: plan.cacheName }); } catch { /* Keep the verified current film even if reclaiming space fails. */ }
      return { ...previous, state: 'ready', ready: true };
    }
    let storage = {};
    try { storage = await navigator.storage?.estimate() || {}; } catch { /* A missing estimate does not forbid a download. */ }
    const available = Number(storage.quota || 0) - Number(storage.usage || 0);
    if (storage.quota && available < plan.bytes * 1.05) throw failure('storage-full', 'There is not enough space for the complete bilingual film.', { required: plan.bytes, available });
    let persisted = false;
    try { persisted = await navigator.storage?.persist?.() || false; } catch { /* Browser storage persistence is best effort. */ }
    const cache = await caches.open(plan.cacheName);
    await cache.delete(readyURL(SCOPE));
    let bytesDone = 0, filesDone = 0;
    notify({ state: 'downloading', totalBytes: plan.bytes, totalFiles: plan.files.length, persisted });
    try {
      for (const file of plan.files) {
        checkAbort(controller.signal);
        const response = await verifiedResponse(file, controller.signal, current => notify({ bytesDone: bytesDone + current, filesDone, percent: (bytesDone + current) / plan.bytes }));
        checkAbort(controller.signal);
        await cache.put(file.url, response);
        bytesDone += file.bytes; filesDone += 1;
        notify({ bytesDone, filesDone, percent: bytesDone / plan.bytes });
      }
      checkAbort(controller.signal);
      const complete = { ...plan, complete: true, downloadedAt: new Date().toISOString(), persisted };
      // The worker never serves a partial cache. The marker is committed only
      // after every file's byte count and SHA-256 have been verified.
      await cache.put(readyURL(SCOPE), new Response(JSON.stringify(complete), { headers: { 'Content-Type': 'application/json' } }));
      checkAbort(controller.signal);
      const registry = await caches.open(REGISTRY);
      await registry.put(await recordURL(key), new Response(JSON.stringify(complete), { headers: { 'Content-Type': 'application/json' } }));
      // A content-addressed edition has a different registry key. Commit the
      // new ready film first, then reclaim complete saves from this app only.
      try { await removeStoredEditions({ keepCacheName: plan.cacheName }); } catch { /* Cleanup failure cannot invalidate a verified download. */ }
      notify({ state: 'ready', ready: true, bytesDone: plan.bytes, percent: 1 });
      return { ...complete, state: 'ready', ready: true };
    } catch (error) {
      // Preserve the previous complete edition if updating was interrupted.
      if (previous?.cacheName !== plan.cacheName) await caches.delete(plan.cacheName);
      else await cache.delete(readyURL(SCOPE));
      throw error;
    }
  }).catch(error => {
    notify({ state: error.name === 'AbortError' ? 'cancelled' : 'error', ready: false, error: error.code || error.name });
    throw error;
  }).finally(() => { signal?.removeEventListener('abort', forwardAbort); active.delete(key); });
  active.set(key, entry);
  notify({ state: 'preparing' });
  return entry.promise;
}
export function cancel(media) { active.get(mediaKey(media))?.controller.abort(); }
export async function remove(media) {
  if (!supported()) return;
  const key = mediaKey(media), running = active.get(key);
  running?.controller.abort();
  if (running) await running.promise.catch(() => {});
  await removeStoredEditions({ currentKey: key });
  plans.delete(key);
  emit({ key, state: 'not-downloaded', ready: false });
}
