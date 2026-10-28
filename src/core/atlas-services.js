import { APP_ROOT } from './paths.js';

/** Bounded, shared requests for public data sources; no credential-bearing APIs. */
export function retryDelay(value, now = Date.now()) {
  const seconds = Number(value);
  if (value && Number.isFinite(seconds)) return Math.max(1000, Math.min(seconds * 1000, Number.MAX_SAFE_INTEGER));
  const date = Date.parse(value || '');
  return Number.isFinite(date) ? Math.max(1000, date - now) : 60000;
}

export function createRequestClient({ fetcher = (...args) => globalThis.fetch(...args), now = () => Date.now() } = {}) {
  const cached = new Map(), pending = new Map(), cooldown = new Map();
  async function json(url, { ttl = 120000, timeout = 6500, signal, credentials = 'omit', group = new URL(url).origin } = {}) {
    const key = String(url), previous = cached.get(key);
    if (previous && previous.until > now()) return previous.value;
    if ((cooldown.get(group) || 0) > now()) throw Object.assign(new Error('Source cooling down'), { code:'cooldown' });
    const inFlight = pending.get(key);
    if (inFlight && !inFlight.controller.signal.aborted) return inFlight.promise;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once:true });
    const timer = setTimeout(abort, timeout);
    const request = Promise.resolve().then(async () => {
      try {
        const response = await fetcher(key, { signal:controller.signal, headers:{ Accept:'application/json' }, cache:'no-cache', credentials });
        if (!response.ok) {
          const delay = response.status === 429 ? retryDelay(response.headers?.get('Retry-After'), now()) : 30000;
          cooldown.set(group, now() + delay);
          throw Object.assign(new Error('Public source not ready'), { code:response.status });
        }
        const value = await response.json();
        cached.set(key, { value, until:now() + ttl });
        if (cached.size > 80) cached.delete(cached.keys().next().value);
        return value;
      } catch (error) {
        if (controller.signal.aborted && !signal?.aborted) error = Object.assign(new Error('Public source timed out'), { code:'timeout' });
        if (error.name !== 'AbortError' && (cooldown.get(group) || 0) <= now()) cooldown.set(group, now() + 30000);
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        if (pending.get(key)?.promise === request) pending.delete(key);
      }
    });
    pending.set(key, { promise:request, controller });
    return request;
  }
  return { json };
}

export const publicRequests = createRequestClient();
const baseURL = () => APP_ROOT.href;
const capability = new Map();
const storage = () => { try { return globalThis.sessionStorage; } catch { return null; } };

export function isStaticHost(url = baseURL()) {
  const parsed = new URL(url);
  return parsed.protocol === 'file:' || /(?:^|\.)github\.io$/i.test(parsed.hostname);
}

/** Probe each backend route at most once on a static deployment, across pages. */
export async function backendJSON(path, options = {}) {
  const url = new URL(path, baseURL());
  if (isStaticHost(url)) throw Object.assign(new Error('Static deployment'), { code:'static' });
  const route = `${url.origin}${url.pathname}`, key = `relic:backend:${route}`;
  let unavailable = capability.get(route) || 0;
  try { unavailable = Math.max(unavailable, Number(storage()?.getItem(key)) || 0); } catch {}
  if (unavailable > Date.now()) throw Object.assign(new Error('Static backend route'), { code:'static' });
  try {
    const value = await publicRequests.json(url.href, { ...options, credentials:'same-origin', group:`backend:${route}` });
    if (!value || typeof value !== 'object') throw Object.assign(new Error('Invalid backend data'), { code:'invalid' });
    return value;
  } catch (error) {
    if ([404,405,410,501,'invalid'].includes(error.code) || error instanceof SyntaxError) {
      const until = Date.now() + 6 * 3600000;
      capability.set(route, until);
      try { storage()?.setItem(key, String(until)); } catch {}
    }
    throw error;
  }
}

function featureKey(feature) {
  const base = new URL('./', baseURL());
  return `relic:backend-feature:${base.origin}${base.pathname}:${feature}`;
}
export function backendFeatureAvailable(feature) {
  if (isStaticHost()) return false;
  const key = featureKey(feature);
  let until = capability.get(key) || 0;
  try { until = Math.max(until, Number(storage()?.getItem(key)) || 0); } catch {}
  return until <= Date.now();
}
export function markBackendFeatureUnavailable(feature, seconds = 21600) {
  const key = featureKey(feature);
  let prior = capability.get(key) || 0;
  try { prior = Math.max(prior, Number(storage()?.getItem(key)) || 0); } catch {}
  const until = Math.max(prior, Date.now() + seconds*1000);
  capability.set(key, until);
  try { storage()?.setItem(key, String(until)); } catch {}
}
