import { openApiSettings } from './api-settings.js';
import { initializeAppSettings } from './app-settings.js';
import { initializeNavigation } from './navigation.js';

const APP_ROOT = new URL('./', import.meta.url);
export const RETURN_MARKER = 'relic:return-to-atlas';

initializeAppSettings({ privateEdition:false, onProviderSettings:() => openApiSettings() });
initializeNavigation();

// Moving back from a world is still the same exploration session. A later
// direct visit or reload opens the film again, as does the replay control.
if (!document.body.classList.contains('atlas-page')) {
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target && link.target !== '_self') return;
    const destination = new URL(link.href, document.baseURI);
    if (destination.origin !== APP_ROOT.origin) return;
    if (![APP_ROOT.pathname, new URL('index.html', APP_ROOT).pathname].includes(destination.pathname)) return;
    try { sessionStorage.setItem(RETURN_MARKER, JSON.stringify({ at:Date.now(), path:APP_ROOT.pathname })); } catch { /* Storage can be unavailable. */ }
  });
}

let workerRegistration;
export function registerApplicationWorker() {
  if (!globalThis.isSecureContext || !('serviceWorker' in navigator)) return Promise.resolve(null);
  if (!workerRegistration) {
    workerRegistration = navigator.serviceWorker.register(new URL('sw.js', APP_ROOT).href, { scope:APP_ROOT.pathname })
      .catch(() => null);
  }
  return workerRegistration;
}

// Only an explicit offline-film download warms the full offline shell. Normal
// visits keep their network work small and let the current page load first.
export async function warmOfflineShell({ signal } = {}) {
  const registration = await registerApplicationWorker();
  if (!registration) throw new Error('Offline storage is unavailable.');
  await navigator.serviceWorker.ready;
  const worker = navigator.serviceWorker.controller || registration.active;
  if (!worker) throw new Error('Offline storage is not ready.');
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (error) => {
      clearTimeout(timeout); channel.port1.close(); signal?.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    };
    const aborted = () => finish(new DOMException('Cancelled', 'AbortError'));
    const timeout = setTimeout(() => finish(new Error('Offline preparation timed out.')), 45000);
    channel.port1.onmessage = event => finish(event.data?.ok ? null : new Error('Offline preparation is unavailable.'));
    if (signal?.aborted) return aborted();
    signal?.addEventListener('abort', aborted, { once:true });
    worker.postMessage({ type:'RELIC_CACHE_OFFLINE_SHELL' }, [channel.port2]);
  });
}

// Only the small application shell is cached during installation. Saving the
// complete movie is a separate, explicit action in the film player.
if (document.readyState === 'complete') registerApplicationWorker();
else window.addEventListener('load', () => registerApplicationWorker(), { once:true });
