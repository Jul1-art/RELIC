import { getLanguage, setLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';

const STORAGE_KEY = 'relic.preferences.v1';
const root = document.documentElement;
const defaults = Object.freeze({ language:'en', theme:'night', accent:'mono', motion:'system', quality:'adaptive' });
const choices = Object.freeze({ language:['en','fr'], theme:['night'], accent:['mono'], motion:['system','full','reduced'], quality:['adaptive','high'] });
const sections = ['general','display','experience'];
const COPY = {
  en:{
    settings:'Settings', subtitle:'Viewing preferences', general:'General', display:'Display', experience:'Experience',
    generalTitle:'Language', generalHint:'',
    displayTitle:'Rendering', displayHint:'',
    experienceTitle:'Motion', experienceHint:'Transitions and camera journeys.',
    language:'Language', languageHint:'Menus and the introduction.', theme:'Appearance', themeHint:'A consistent theme across your views.',
    accent:'Accent colour', accentHint:'Monochrome by default. Blue when you want it.', quality:'3D quality', qualityHint:'Applies to the atlas and planetary views.',
    motion:'Animations', motionHint:'Page transitions, interface motion and camera journeys.',
    night:'Dark', day:'Light', mono:'Monochrome', nasa:'NASA blue', system:'Use device setting', full:'Full motion', reduced:'Reduced motion',
    systemHint:'Follows your device’s motion preference.', fullHint:'Smooth transitions and camera movement.', reducedHint:'Keeps movement brief and direct.',
    adaptive:'Adaptive', high:'High detail', adaptiveHint:'Balances detail and battery.', highHint:'Sharper rendering.',
    motionNote:'Reduced motion keeps exploration fully interactive.',
    reset:'Reset preferences', done:'Done', close:'Close settings', ready:'Changes apply immediately.', saved:'Saved on this device.',
    temporary:'Applied for this visit. Device storage is unavailable.', resetDone:'Default preferences restored.',
    providers:'Map access', providersHint:'Manage your optional map provider.', unavailable:'This action is unavailable right now.',
  },
  fr:{
    settings:'Réglages', subtitle:'Préférences d’affichage', general:'Général', display:'Affichage', experience:'Interaction',
    generalTitle:'Langue', generalHint:'',
    displayTitle:'Rendu', displayHint:'',
    experienceTitle:'Animations', experienceHint:'Transitions et mouvements de caméra.',
    language:'Langue', languageHint:'Les menus et l’introduction.', theme:'Apparence', themeHint:'Un thème commun à toutes vos vues.',
    accent:'Couleur d’accent', accentHint:'Monochrome par défaut. Bleu, si vous le souhaitez.', quality:'Qualité 3D', qualityHint:'Pour l’atlas et les vues des planètes.',
    motion:'Animations', motionHint:'Transitions de page, interface et mouvements de caméra.',
    night:'Sombre', day:'Clair', mono:'Monochrome', nasa:'Bleu NASA', system:'Réglage de l’appareil', full:'Complètes', reduced:'Réduites',
    systemHint:'Suit la préférence de mouvement de votre appareil.', fullHint:'Transitions et mouvements de caméra fluides.', reducedHint:'Des mouvements brefs et directs.',
    adaptive:'Adaptatif', high:'Détails élevés', adaptiveHint:'Équilibre détail et autonomie.', highHint:'Un rendu plus précis.',
    motionNote:'Les animations réduites conservent toute l’interactivité.',
    reset:'Réinitialiser', done:'Terminé', close:'Fermer les réglages', ready:'Les changements sont immédiats.', saved:'Enregistré sur cet appareil.',
    temporary:'Appliqué pour cette visite. Le stockage est indisponible.', resetDone:'Préférences par défaut restaurées.',
    providers:'Accès aux cartes', providersHint:'Gérer votre fournisseur de cartes facultatif.', unavailable:'Cette action est momentanément indisponible.',
  },
};

function initialPreferences() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { /* The session still works without device storage. */ }
  const result = { ...defaults, language:getLanguage() };
  for (const key of ['motion','quality']) if (choices[key].includes(saved[key])) result[key] = saved[key];
  return result;
}

let preferences = initialPreferences();
let installed = false;
let dialog;
let trigger;
let activeSection = 'general';
let configuration = { privateEdition:true, onProviderSettings:null };
let statusKey = 'ready';
const copy = () => COPY[getLanguage() === 'fr' ? 'fr' : 'en'];
const motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

function applyPreferences() {
  root.dataset.theme = 'night';
  root.dataset.accent = 'mono';
  root.dataset.motion = preferences.motion === 'system' ? (motionQuery?.matches ? 'reduced' : 'full') : preferences.motion;
  root.dataset.quality = preferences.quality;
  const color = document.querySelector('meta[name="theme-color"]');
  if (color) color.content = '#000000';
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

/** Apply viewing preferences only; never remove credentials or saved films. */
export function setPreferences(patch = {}) {
  const next = { ...preferences };
  for (const key of Object.keys(choices)) if (choices[key].includes(patch[key])) next[key] = patch[key];
  next.theme = 'night'; next.accent = 'mono';
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
  link.rel = 'stylesheet';
  link.href = new URL('./app-settings.css?v=2', import.meta.url).href;
  link.dataset.relicSettingsStyle = '';
  document.head.appendChild(link);
}

function option(key, value, icon, hint = '') {
  const languageLabel = value === 'en' ? 'English' : 'Français';
  const label = key === 'language' ? `<strong lang="${value}">${languageLabel}</strong>` : `<strong data-settings-copy="${value}"></strong>`;
  const preview = key === 'accent' ? `<span class="relic-settings-swatch" data-swatch="${value}" aria-hidden="true"></span>`
    : key === 'theme' ? `<span class="relic-settings-preview" data-preview="${value}" aria-hidden="true">${worldIcon(icon)}</span>`
    : icon ? `<span class="relic-settings-option-icon" aria-hidden="true">${worldIcon(icon)}</span>` : '';
  return `<button type="button" class="relic-settings-option" role="radio" data-setting="${key}" data-value="${value}" aria-checked="false" tabindex="-1">${preview}<span class="relic-settings-option-copy">${label}${hint ? `<small data-settings-copy="${hint}"></small>` : ''}</span><span class="relic-settings-selected" aria-hidden="true"></span></button>`;
}

function field(key, values) {
  return `<div class="relic-settings-field" data-settings-field="${key}"><h4 id="settings-label-${key}" data-settings-copy="${key}"></h4><p id="settings-hint-${key}" class="relic-settings-hint" data-settings-copy="${key}Hint"></p><div class="relic-settings-options" role="radiogroup" aria-labelledby="settings-label-${key}" aria-describedby="settings-hint-${key}">${values.map(value => option(key, ...value)).join('')}</div></div>`;
}

function sectionHeading(section) {
  return `<div class="relic-settings-section-heading"><h3 data-settings-copy="${section}Title"></h3><p data-settings-copy="${section}Hint"></p></div>`;
}

function buildDialog() {
  ensureStyles();
  dialog = document.createElement('dialog');
  dialog.className = 'relic-settings-dialog';
  dialog.id = 'relic-app-settings';
  dialog.setAttribute('aria-labelledby','relic-settings-title');
  dialog.setAttribute('aria-describedby','relic-settings-subtitle');
  dialog.innerHTML = `<header class="relic-settings-header"><div><p class="relic-settings-eyebrow"><img class="relic-dialog-logo" src="${new URL('../../assets/relic-logo-v1.png', import.meta.url).href}" alt="" width="26" height="23">RELIC <span aria-hidden="true">/</span> <span data-settings-copy="settings"></span></p><h2 id="relic-settings-title" data-settings-copy="settings"></h2><p id="relic-settings-subtitle" class="relic-settings-intro" data-settings-copy="subtitle"></p></div><button class="relic-settings-close" type="button" data-settings-close>${worldIcon('xmark')}</button></header>
    <nav class="relic-settings-tabs" role="tablist" aria-label="Settings sections">${sections.map((section, index) => `<button type="button" role="tab" id="settings-tab-${section}" data-settings-tab="${section}" aria-controls="settings-panel-${section}" aria-selected="${index === 0}" tabindex="${index === 0 ? '0' : '-1'}">${worldIcon(['globe','sliders','compass'][index])}<span data-settings-copy="${section}"></span></button>`).join('')}</nav>
    <div class="relic-settings-content">
      <section class="relic-settings-section" id="settings-panel-general" data-settings-panel="general" role="tabpanel" aria-labelledby="settings-tab-general">${sectionHeading('general')}${field('language', [['en'],['fr']])}</section>
      <section class="relic-settings-section" id="settings-panel-display" data-settings-panel="display" role="tabpanel" aria-labelledby="settings-tab-display" hidden>${sectionHeading('display')}${field('quality', [['adaptive','globe','adaptiveHint'],['high','cube','highHint']])}<button class="relic-settings-provider" type="button" data-settings-provider hidden><span>${worldIcon('layer-group')}</span><span><strong data-settings-copy="providers"></strong><small data-settings-copy="providersHint"></small></span>${worldIcon('arrow-up-right-from-square')}</button></section>
      <section class="relic-settings-section" id="settings-panel-experience" data-settings-panel="experience" role="tabpanel" aria-labelledby="settings-tab-experience" hidden>${sectionHeading('experience')}${field('motion', [['system','sliders','systemHint'],['full','play','fullHint'],['reduced','pause','reducedHint']])}</section>
    </div>
    <footer class="relic-settings-footer"><p class="relic-settings-status" role="status" aria-live="polite"></p><div class="relic-settings-footer-actions"><button type="button" class="relic-settings-reset" data-settings-reset>${worldIcon('rotate')}<span data-settings-copy="reset"></span></button><button type="button" class="relic-settings-done" data-settings-close data-settings-copy="done"></button></div></footer>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', event => {
    const setting = event.target.closest('[data-setting]');
    if (setting) { setPreferences({ [setting.dataset.setting]:setting.dataset.value }); return; }
    const tab = event.target.closest('[data-settings-tab]');
    if (tab) { selectSection(tab.dataset.settingsTab); return; }
    if (event.target.closest('[data-settings-close]')) { closeSettings(); return; }
    if (event.target.closest('[data-settings-reset]')) {
      const { persistent } = setPreferences(defaults);
      statusKey = persistent ? 'resetDone' : 'temporary';
      render();
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
    if (dialog.dataset.restoreFocus !== 'false') {
      const visible = node => node?.isConnected && node.getClientRects().length && !node.closest('[inert],[hidden]');
      const target = visible(trigger) ? trigger : [...document.querySelectorAll('#rail-more,[data-app-settings],#relic-settings')].find(visible);
      target?.focus({ preventScroll:true });
    }
    delete dialog.dataset.restoreFocus;
  });
  dialog.addEventListener('keydown', keyboard);
  render();
}

function selectSection(section, focus = false) {
  if (!sections.includes(section)) return;
  activeSection = section;
  render();
  if (dialog) dialog.querySelector('.relic-settings-content').scrollTop = 0;
  if (focus) dialog.querySelector(`[data-settings-tab="${section}"]`).focus({ preventScroll:true });
}

function keyboard(event) {
  const arrows = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'];
  const tab = event.target.closest('[data-settings-tab]');
  if (tab && arrows.includes(event.key)) {
    event.preventDefault();
    const index = sections.indexOf(tab.dataset.settingsTab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length-1 : (index + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + sections.length) % sections.length;
    selectSection(sections[next], true);
    return;
  }
  const setting = event.target.closest('[data-setting]');
  if (setting && arrows.includes(event.key)) {
    event.preventDefault();
    const key = setting.dataset.setting;
    const values = choices[key];
    const index = values.indexOf(setting.dataset.value);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? values.length-1 : (index + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1) + values.length) % values.length;
    setPreferences({ [key]:values[next] });
    dialog.querySelector(`[data-setting="${key}"][data-value="${values[next]}"]`).focus({ preventScroll:true });
    return;
  }
  if (event.key === 'Escape' && typeof dialog.showModal !== 'function') { event.preventDefault(); closeSettings(); }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.querySelectorAll('button,a[href],input,select,[tabindex]:not([tabindex="-1"])')].filter(node => !node.disabled && node.tabIndex >= 0 && !node.hidden && node.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function render() {
  const text = copy();
  for (const button of document.querySelectorAll('[data-app-settings],#relic-settings')) {
    button.setAttribute('aria-label', text.settings);
    button.title = text.settings;
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-controls','relic-app-settings');
  }
  if (!dialog) return;
  for (const node of dialog.querySelectorAll('[data-settings-copy]')) node.textContent = text[node.dataset.settingsCopy] || '';
  for (const button of dialog.querySelectorAll('[data-settings-close]')) if (!button.hasAttribute('data-settings-copy')) button.setAttribute('aria-label',text.close);
  dialog.querySelector('.relic-settings-tabs').setAttribute('aria-label',getLanguage() === 'fr' ? 'Sections des réglages' : 'Settings sections');
  for (const button of dialog.querySelectorAll('[data-setting]')) {
    const selected = preferences[button.dataset.setting] === button.dataset.value;
    button.setAttribute('aria-checked',String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
  for (const tab of dialog.querySelectorAll('[data-settings-tab]')) {
    const selected = tab.dataset.settingsTab === activeSection;
    tab.setAttribute('aria-selected',String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of dialog.querySelectorAll('[data-settings-panel]')) panel.hidden = panel.dataset.settingsPanel !== activeSection;
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
  if (typeof dialog.close === 'function') dialog.close();
  else {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  }
}

export function initializeAppSettings(options = {}) {
  configuration = { ...configuration, ...options };
  ensureStyles();
  applyPreferences();
  render();
  if (!installed) {
    installed = true;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-app-settings],#relic-settings');
      if (!button || button.disabled || button.closest('[inert]')) return;
      event.preventDefault();
      openSettings(button);
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
    applyPreferences();
    render();
    window.dispatchEvent(new CustomEvent('relic-preferences-change', { detail:getPreferences() }));
  } catch { /* Ignore malformed settings from another tab. */ }
});
applyPreferences();
