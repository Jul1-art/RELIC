import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { initializeApiSettings } from './api-settings.js';

const APP_ROOT = new URL('./', import.meta.url);
export const RETURN_MARKER = 'relic:return-to-atlas';

for (const button of document.querySelectorAll('#relic-settings, [data-api-settings]')) {
  initializeApiSettings({ button, getLanguage });
  onLanguageChange(language => {
    const label = language === 'fr' ? 'Clés API et paramètres' : 'API keys and settings';
    button.setAttribute('aria-label', label);
    button.title = label;
  });
}

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

// Only the small application shell is cached during installation. Saving the
// complete movie is a separate, explicit action in the film player.
registerApplicationWorker();
