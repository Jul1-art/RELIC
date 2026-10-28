import { openApiSettings } from '../ui/api-settings.js';
import { initializeAppSettings } from '../ui/app-settings.js';
import { initializeNavigation } from '../ui/navigation.js';
import { openSources } from '../ui/app-sources.js';
import { initializePlanetDashboard } from '../ui/planet-dashboard.js';
import { worldIcon, hydrateWorldIcons } from '../ui/world-icons.js';
import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';

const APP_ROOT = new URL('../../', import.meta.url);
export const RETURN_MARKER = 'relic:return-to-atlas';

initializePlanetDashboard();
initializeAppSettings({ privateEdition:false, onProviderSettings:() => openApiSettings() });
initializeNavigation();

// Film playback belongs to the Solar System page. Sources stay in this view.
const headerActions = document.querySelector('.header-actions');
const isAtlas = document.body.classList.contains('atlas-page');
let sourceButton = document.getElementById('relic-credits');
if (!sourceButton && headerActions) {
  sourceButton = document.createElement('button');
  sourceButton.id = 'relic-credits'; sourceButton.type = 'button'; sourceButton.className = 'relic-icon-button';
  headerActions.insertBefore(sourceButton, headerActions.querySelector('[data-app-settings]'));
}
if (sourceButton) {
  sourceButton.innerHTML = worldIcon('circle-info');
  sourceButton.addEventListener('click', () => { void openSources(sourceButton); });
}
const filmButton = document.getElementById('relic-replay');
if (filmButton && !isAtlas) filmButton.remove();
else if (filmButton) filmButton.innerHTML = worldIcon('film');
const settingsButton = headerActions?.querySelector('[data-app-settings]');
if (settingsButton) settingsButton.innerHTML = worldIcon('gear');
hydrateWorldIcons();
function labelUtilities() {
  const fr = getLanguage() === 'fr';
  for (const [id, label] of [['relic-replay',fr?'Voir le film':'Watch the film'],['relic-credits',fr?'Sources et créateurs':'Sources and creators']]) {
    const button = document.getElementById(id);
    if (button) { button.setAttribute('aria-label',label); button.title=label; }
  }
}
labelUtilities(); onLanguageChange(labelUtilities);

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
