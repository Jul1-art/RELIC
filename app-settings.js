import { getLanguage, setLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';

const STORAGE_KEY = 'relic.preferences.v1';
const root = document.documentElement;
const defaults = Object.freeze({ language:'en', theme:'night', accent:'mono', motion:'system', quality:'adaptive' });
const choices = Object.freeze({ language:['en','fr'], theme:['night','day'], accent:['mono','nasa'], motion:['system','full','reduced'], quality:['adaptive','high'] });
const COPY = {
  en:{ settings:'Settings', intro:'Make the journey yours.', general:'Appearance & language', exploration:'Your experience', language:'Language', theme:'Appearance', accent:'Accent', motion:'Motion', quality:'Rendering', qualityHint:'Adaptive balances detail and battery life.', night:'Dark', day:'Light', mono:'Monochrome', nasa:'NASA blue', system:'System', full:'Full', reduced:'Reduced', adaptive:'Adaptive', high:'High detail', reset:'Reset preferences', close:'Close settings', ready:'Changes apply immediately.', saved:'Saved on this device.', temporary:'Applied for this session. Device storage is unavailable.', film:'Watch the introduction', filmHint:'Return to the story of exploration.', providers:'Provider access', providersHint:'Manage your optional map access.', resetDone:'Default preferences restored.', unavailable:'This action is unavailable right now.' },
  fr:{ settings:'Réglages', intro:'Explorez à votre façon.', general:'Apparence et langue', exploration:'Votre expérience', language:'Langue', theme:'Apparence', accent:'Accent', motion:'Animations', quality:'Rendu', qualityHint:'Adaptatif équilibre les détails et l’autonomie.', night:'Sombre', day:'Clair', mono:'Monochrome', nasa:'Bleu NASA', system:'Système', full:'Complètes', reduced:'Réduites', adaptive:'Adaptatif', high:'Détails élevés', reset:'Réinitialiser', close:'Fermer les réglages', ready:'Les changements sont immédiats.', saved:'Enregistré sur cet appareil.', temporary:'Appliqué pour cette session. Le stockage de l’appareil est indisponible.', film:'Revoir l’introduction', filmHint:'Retrouvez l’histoire de l’exploration.', providers:'Accès aux cartes', providersHint:'Gérer votre accès facultatif aux cartes.', resetDone:'Préférences par défaut restaurées.', unavailable:'Cette action est momentanément indisponible.' },
};

function initialPreferences() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { /* The current session remains usable. */ }
  let theme = root.dataset.theme === 'day' ? 'day' : 'night';
  try { theme = localStorage.getItem('nasa-atlas-theme') === 'day' ? 'day' : theme; } catch {}
  const result = { ...defaults, theme, language:getLanguage() };
  for (const key of ['theme','accent','motion','quality']) if (choices[key].includes(saved[key])) result[key] = saved[key];
  return result;
}

let preferences = initialPreferences();
let installed = false;
let dialog;
let trigger;
let configuration = { privateEdition:true, onProviderSettings:null };
let statusKey = 'ready';
const copy = () => COPY[getLanguage() === 'fr' ? 'fr' : 'en'];
const motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

function applyPreferences() {
  root.dataset.theme = preferences.theme;
  root.dataset.accent = preferences.accent;
  root.dataset.motion = preferences.motion === 'system' ? (motionQuery?.matches ? 'reduced' : 'full') : preferences.motion;
  root.dataset.quality = preferences.quality;
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.content = preferences.theme === 'day' ? '#f5f5f3' : '#050505';
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    localStorage.setItem('nasa-atlas-theme', preferences.theme);
    statusKey = 'saved';
    return true;
  } catch { statusKey = 'temporary'; return false; }
}

export function getPreferences() { return { ...preferences }; }

/** Apply viewing preferences only. Provider credentials and media caches are untouched. */
export function setPreferences(patch = {}) {
  const next = { ...preferences };
  for (const key of Object.keys(choices)) if (choices[key].includes(patch[key])) next[key] = patch[key];
  preferences = next;
  if (getLanguage() !== next.language) setLanguage(next.language);
  applyPreferences();
  const persistent = persist();
  render();
  window.dispatchEvent(new CustomEvent('relic-preferences-change', { detail:getPreferences() }));
  return { preferences:getPreferences(), persistent };
}

function ensureStyles() {
  if (document.querySelector('link[data-relic-settings-style],link[href*="app-settings.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./app-settings.css', import.meta.url).href;
  link.dataset.relicSettingsStyle = '';
  document.head.appendChild(link);
}

function segment(key, icon, values, hint = '') {
  return `<div class="relic-settings-row"><div class="relic-settings-label" id="settings-label-${key}"><span class="relic-settings-icon">${worldIcon(icon)}</span><div><strong data-settings-copy="${key}"></strong>${hint ? `<small data-settings-copy="${hint}"></small>` : ''}</div></div><div class="relic-settings-segment" role="group" aria-labelledby="settings-label-${key}">${values.map(value => `<button type="button" data-setting="${key}" data-value="${value}" aria-pressed="false"><span ${key === 'language' ? `lang="${value}"` : `data-settings-copy="${value}"`}>${key === 'language' ? (value === 'en' ? 'English' : 'Français') : ''}</span></button>`).join('')}</div></div>`;
}

function buildDialog() {
  ensureStyles();
  dialog = document.createElement('dialog');
  dialog.className = 'relic-settings-dialog'; dialog.id = 'relic-app-settings';
  dialog.setAttribute('aria-labelledby','relic-settings-title');
  dialog.innerHTML = `<header class="relic-settings-header"><div><p class="relic-settings-eyebrow">RELIC</p><h2 id="relic-settings-title" data-settings-copy="settings"></h2><p class="relic-settings-intro" data-settings-copy="intro"></p></div><button class="relic-settings-close" type="button" data-settings-close>${worldIcon('xmark')}</button></header><div class="relic-settings-content"><section class="relic-settings-section" aria-labelledby="relic-settings-general"><h3 id="relic-settings-general" data-settings-copy="general"></h3>${segment('language','globe',['en','fr'])}${segment('theme','sun',['night','day'])}${segment('accent','sliders',['mono','nasa'])}</section><section class="relic-settings-section" aria-labelledby="relic-settings-exploration"><h3 id="relic-settings-exploration" data-settings-copy="exploration"></h3>${segment('motion','compass',['system','full','reduced'])}${segment('quality','cube',['adaptive','high'],'qualityHint')}<button class="relic-settings-action" type="button" data-settings-film><span class="relic-settings-icon">${worldIcon('play')}</span><span><strong data-settings-copy="film"></strong><small data-settings-copy="filmHint"></small></span><span class="relic-settings-action-arrow" aria-hidden="true">${worldIcon('arrow-up-right-from-square')}</span></button><button class="relic-settings-action" type="button" data-settings-provider hidden><span class="relic-settings-icon">${worldIcon('layer-group')}</span><span><strong data-settings-copy="providers"></strong><small data-settings-copy="providersHint"></small></span><span class="relic-settings-action-arrow" aria-hidden="true">${worldIcon('arrow-up-right-from-square')}</span></button></section></div><footer class="relic-settings-footer"><p class="relic-settings-status" role="status" aria-live="polite"></p><button type="button" class="relic-settings-reset" data-settings-reset>${worldIcon('rotate')}<span data-settings-copy="reset"></span></button></footer>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', event => {
    const setting = event.target.closest('[data-setting]');
    if (setting) { setPreferences({ [setting.dataset.setting]:setting.dataset.value }); return; }
    if (event.target.closest('[data-settings-close]')) { closeSettings(); return; }
    if (event.target.closest('[data-settings-reset]')) {
      const { persistent } = setPreferences(defaults);
      statusKey = persistent ? 'resetDone' : 'temporary'; render(); return;
    }
    if (event.target.closest('[data-settings-film]')) {
      closeSettings(false);
      if (typeof window.RELICFilm?.replay === 'function') window.RELICFilm.replay();
      else location.assign(new URL('./index.html?film=1', import.meta.url).href);
      return;
    }
    if (event.target.closest('[data-settings-provider]') && !configuration.privateEdition && typeof configuration.onProviderSettings === 'function') {
      closeSettings(false);
      Promise.resolve().then(configuration.onProviderSettings).catch(() => { statusKey = 'unavailable'; openSettings(trigger); });
      return;
    }
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeSettings();
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.dataset.restoreFocus !== 'false' && trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll:true });
    delete dialog.dataset.restoreFocus;
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && typeof dialog.showModal !== 'function') { event.preventDefault(); closeSettings(); }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button,a[href],input,select,[tabindex]:not([tabindex="-1"])')].filter(node => !node.disabled && !node.hidden && node.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  render();
}

function render() {
  const text = copy();
  for (const button of document.querySelectorAll('[data-app-settings],#relic-settings')) {
    button.setAttribute('aria-label', text.settings); button.title = text.settings;
    button.setAttribute('aria-haspopup','dialog'); button.setAttribute('aria-controls','relic-app-settings');
  }
  if (!dialog) return;
  for (const node of dialog.querySelectorAll('[data-settings-copy]')) node.textContent = text[node.dataset.settingsCopy] || '';
  dialog.querySelector('[data-settings-close]').setAttribute('aria-label',text.close);
  for (const button of dialog.querySelectorAll('[data-setting]')) button.setAttribute('aria-pressed',String(preferences[button.dataset.setting] === button.dataset.value));
  dialog.querySelector('[data-settings-provider]').hidden = configuration.privateEdition || typeof configuration.onProviderSettings !== 'function';
  dialog.querySelector('.relic-settings-status').textContent = text[statusKey];
}

export function openSettings(button) {
  if (!dialog) buildDialog();
  trigger = button?.focus ? button : document.activeElement;
  render();
  if (dialog.open) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else { dialog.setAttribute('open',''); dialog.setAttribute('aria-modal','true'); }
  dialog.querySelector('[data-settings-close]').focus({ preventScroll:true });
}

export function closeSettings(restoreFocus = true) {
  if (!dialog?.open) return;
  dialog.dataset.restoreFocus = String(restoreFocus);
  if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
}

export function initializeAppSettings(options = {}) {
  configuration = { ...configuration, ...options };
  ensureStyles(); applyPreferences(); render();
  if (!installed) {
    installed = true;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-app-settings],#relic-settings');
      if (!button || button.disabled || button.closest('[inert]')) return;
      event.preventDefault(); openSettings(button);
    });
  }
  return { open:openSettings, close:closeSettings, getPreferences, setPreferences };
}

onLanguageChange(language => {
  if (preferences.language !== language) { preferences.language = language; persist(); }
  render();
});
motionQuery?.addEventListener?.('change', () => {
  if (preferences.motion !== 'system') return;
  applyPreferences();
  window.dispatchEvent(new CustomEvent('relic-preferences-change', { detail:getPreferences() }));
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    const value = JSON.parse(event.newValue);
    for (const key of Object.keys(choices)) if (choices[key].includes(value[key])) preferences[key] = value[key];
    if (getLanguage() !== preferences.language) setLanguage(preferences.language);
    applyPreferences(); render();
    window.dispatchEvent(new CustomEvent('relic-preferences-change', { detail:getPreferences() }));
  } catch { /* Ignore malformed settings from another tab. */ }
});
applyPreferences();
