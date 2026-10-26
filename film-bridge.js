import { getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { openSources as showCredits } from './app-sources.js';
import { createPrologue } from './intro/prologue-v8.js';
import { PROLOGUE, PROLOGUE_MEDIA } from './intro/prologue-data-v8.js';
import * as offlineFilm from './intro/film-offline.js';
import { registerApplicationWorker, warmOfflineShell, RETURN_MARKER } from './world-bridge.js';

const INTRO_ROOT = new URL('./intro/', import.meta.url);
const introduction = document.querySelector('#intro');
const reducedMotion = () => document.documentElement.dataset.motion === 'reduced'
  || (!document.documentElement.dataset.motion && matchMedia('(prefers-reduced-motion: reduce)').matches);
const french = () => getLanguage() === 'fr';
// The player resolves URLs in document scope; offline storage resolves raw
// metadata beside its own module. Keep those two representations separate.
const playbackMedia = structuredClone(PROLOGUE_MEDIA);
function resolveMediaURLs(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['src','hls','poster','encoding','sources'].includes(key) && typeof item === 'string') value[key] = new URL(item, INTRO_ROOT).href;
    else if (item && typeof item === 'object') resolveMediaURLs(item);
  }
}
resolveMediaURLs(playbackMedia);

function setFilmActive(active) {
  window.__relicFilmActive = active;
  document.documentElement.dataset.relicFilm = active ? 'active' : 'closed';
  document.body.classList.toggle('intro-active', active);
  window.dispatchEvent(new CustomEvent('relic-film-state', { detail:{ active } }));
}

let currentDialog = null;
function createDialog(title, trigger) {
  currentDialog?.close();
  const previousFocus = trigger || document.activeElement;
  const video = introduction.querySelector('video');
  if (window.__relicFilmActive) { video?.pause(); introduction.inert = true; }
  const dialog = document.createElement('dialog');
  dialog.className = 'relic-dialog';
  const headingId = `relic-dialog-title-${Date.now()}`;
  dialog.setAttribute('aria-labelledby', headingId);
  dialog.innerHTML = `<header class="relic-dialog-header"><div><p>RELIC</p><h2 id="${headingId}"></h2></div><button class="relic-dialog-close" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="relic-dialog-content"></div>`;
  dialog.querySelector('h2').textContent = title;
  const close = dialog.querySelector('.relic-dialog-close');
  close.setAttribute('aria-label', french() ? 'Fermer' : 'Close');
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (currentDialog === dialog) currentDialog = null;
    introduction.inert = false;
    dialog.remove();
    if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll:true });
  }, { once:true });
  document.body.append(dialog);
  currentDialog = dialog;
  dialog.showModal();
  close.focus({ preventScroll:true });
  return { dialog, content:dialog.querySelector('.relic-dialog-content') };
}

const paragraph = (parent, text, className = '') => {
  const element = document.createElement('p'); element.textContent = text; element.className = className; parent.append(element); return element;
};
async function ensureFilmWorker() {
  const registration = await registerApplicationWorker();
  if (!registration) throw new offlineFilm.OfflineFilmError('unsupported', 'Service worker unavailable');
  if (navigator.serviceWorker.controller) return registration;
  return new Promise((resolve, reject) => {
    const changed = () => {
      if (!navigator.serviceWorker.controller) return;
      clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', changed); resolve(registration);
    };
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
      reject(new offlineFilm.OfflineFilmError('worker-not-ready', 'The application worker is not ready'));
    }, 10000);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    changed();
  });
}

function offlineCopy() {
  return french() ? {
    title:'Le film, partout.', lead:'Le film complet, même sans connexion.', copy:'Enregistrez les versions anglaise et française sur cet appareil. Le téléchargement commence uniquement à votre demande.',
    preparing:'Préparation…', ready:'Le film est disponible hors ligne.', missing:'Pas encore téléchargé.', stale:'Une nouvelle version du film est disponible.',
    download:'Télécharger', update:'Mettre à jour', remove:'Supprimer', cancel:'Annuler le téléchargement', loading:'Téléchargement en cours…',
    note:'Votre navigateur peut libérer cet espace si l’appareil manque de stockage. Les données en direct et les cartes distantes nécessitent une connexion.',
    unsupported:'Ce navigateur ne permet pas de garder le film hors ligne.', noSpace:'L’espace disponible est insuffisant.', unavailable:'Le téléchargement a échoué. Vérifiez la connexion puis réessayez.', connect:'Connectez-vous pour télécharger le film.',
  } : {
    title:'The film, anywhere.', lead:'The complete film, even without a connection.', copy:'Save the English and French versions on this device. Downloading starts only when you choose.',
    preparing:'Getting ready…', ready:'The film is available offline.', missing:'Not downloaded yet.', stale:'A new version of the film is available.',
    download:'Download', update:'Update', remove:'Remove', cancel:'Cancel download', loading:'Downloading…',
    note:'Your browser may free this space if your device runs low on storage. Live data and remote maps need a connection.',
    unsupported:'This browser cannot keep the film offline.', noSpace:'There is not enough free storage.', unavailable:'The download failed. Check your connection and try again.', connect:'Connect to download the film.',
  };
}

async function showOffline({ trigger } = {}) {
  const copy = offlineCopy();
  const { dialog, content } = createDialog(copy.title, trigger);
  paragraph(content, copy.lead, 'relic-dialog-lead'); paragraph(content, copy.copy);
  const card = document.createElement('div'); card.className = 'relic-offline-card'; content.append(card);
  paragraph(card, 'EN + FR · 720p', 'relic-offline-badge');
  const statusText = paragraph(card, copy.preparing); statusText.role = 'status'; statusText.setAttribute('aria-live', 'polite');
  const progress = document.createElement('progress'); progress.max = 1; progress.value = 0; progress.hidden = true; card.append(progress);
  const size = paragraph(card, '', 'relic-dialog-note');
  const errorText = paragraph(card, '', 'relic-dialog-error'); errorText.hidden = true;
  const actions = document.createElement('div'); actions.className = 'relic-dialog-actions'; card.append(actions);
  const download = document.createElement('button'); download.type = 'button'; download.className = 'relic-dialog-primary'; download.textContent = copy.download; download.disabled = true;
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = copy.cancel; cancel.hidden = true;
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = copy.remove; remove.hidden = true;
  actions.append(download, cancel, remove); paragraph(content, copy.note, 'relic-dialog-note');
  let state = { state:'loading', ready:false, bytes:0 }, attempt = null;
  const update = value => {
    if (!dialog.open) return;
    state = { ...state, ...value };
    const busy = ['preparing','downloading'].includes(state.state);
    progress.hidden = !busy; progress.value = state.percent || 0;
    statusText.textContent = state.ready ? copy.ready : busy ? `${copy.loading} ${Math.round((state.percent || 0) * 100)}%`
      : state.supported === false ? copy.unsupported : state.state === 'stale' ? copy.stale : navigator.onLine === false ? copy.connect : copy.missing;
    size.textContent = state.bytes ? `${new Intl.NumberFormat(getLanguage(), { maximumFractionDigits:0 }).format(state.bytes / 1e6)} MB` : '';
    download.hidden = state.ready || busy;
    download.disabled = state.state === 'loading' || state.supported === false || navigator.onLine === false;
    download.textContent = state.state === 'stale' ? copy.update : copy.download;
    cancel.hidden = !busy; remove.hidden = busy || !(state.removable || state.ready);
  };
  const showError = error => {
    errorText.hidden = false;
    errorText.textContent = error.code === 'storage-full' ? copy.noSpace : error.code === 'unsupported' ? copy.unsupported : copy.unavailable;
  };
  const refresh = async () => {
    try { await ensureFilmWorker(); update(await offlineFilm.getStatus(PROLOGUE_MEDIA)); }
    catch (error) { update({ state:'unsupported', supported:false }); showError(error); }
  };
  const unsubscribe = offlineFilm.subscribe(update);
  dialog.addEventListener('close', () => { unsubscribe(); attempt?.abort(); offlineFilm.cancel(PROLOGUE_MEDIA); }, { once:true });
  cancel.addEventListener('click', () => { attempt?.abort(); offlineFilm.cancel(PROLOGUE_MEDIA); });
  remove.addEventListener('click', async () => {
    remove.disabled = true; errorText.hidden = true;
    try { await offlineFilm.remove(PROLOGUE_MEDIA); await refresh(); } catch (error) { showError(error); }
    finally { remove.disabled = false; }
  });
  download.addEventListener('click', async () => {
    if (attempt) return;
    errorText.hidden = true; attempt = new AbortController(); update({ state:'preparing', percent:0 });
    try { await ensureFilmWorker(); await warmOfflineShell({ signal:attempt.signal }); await offlineFilm.download(PROLOGUE_MEDIA, { signal:attempt.signal, onProgress:update }); await refresh(); }
    catch (error) { if (error.name !== 'AbortError') showError(error); await refresh(); }
    finally { attempt = null; }
  });
  await refresh();
}

const film = createPrologue({
  element:introduction, timeline:PROLOGUE, media:playbackMedia, getLanguage, reducedMotion,
  onOpen:() => setFilmActive(true),
  onClose:() => {
    setFilmActive(false);
    if (introduction.contains(document.activeElement)) document.querySelector('#brand-home')?.focus({ preventScroll:true });
  },
  onOffline:showOffline,
  canPlayOffline:() => offlineFilm.canPlayOffline(PROLOGUE_MEDIA),
});

document.querySelector('#relic-replay')?.addEventListener('click', () => film.start());
onLanguageChange(() => { if (currentDialog?.open) currentDialog.close(); });

let returningToAtlas = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
try {
  const marker = JSON.parse(sessionStorage.getItem(RETURN_MARKER) || 'null');
  sessionStorage.removeItem(RETURN_MARKER);
  if (marker?.path === new URL('./', import.meta.url).pathname && Date.now() - marker.at < 5 * 60 * 1000) returningToAtlas = true;
} catch { /* Direct visits continue to show the opening. */ }
const startupParameters = new URL(location.href).searchParams;
if (startupParameters.has('sources') || returningToAtlas && !startupParameters.has('film')) { introduction.classList.add('hidden'); setFilmActive(false); }
else film.start();

// A small diagnostic surface is useful to host pages and automated playback
// checks without exposing or loading any old atlas renderer.
window.RELICFilm = Object.freeze({ replay:() => film.start(), close:() => film.finish(), get phase() { return film.phase; }, showOffline, showCredits });

if (startupParameters.has('sources')) requestAnimationFrame(() => showCredits(document.querySelector('#relic-credits')));
