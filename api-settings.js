import { getCesiumToken, setCesiumToken, clearApiKeys, validateCesiumToken } from './api-config.js';

const COPY = {
  en: {
    title: 'API keys', lead: 'Your keys. Your browser.',
    description: 'The Solar System, NASA imagery and the Moon and Mars terrain work without an API key.',
    provider: 'Cesium ion', optional: 'Optional · Google photorealistic 3D',
    providerCopy: 'To explore Google’s 3D Earth imagery, use your own Cesium ion browser token and enable the Google Photorealistic 3D Tiles asset in your ion account. Provider quotas and terms apply.',
    create: 'Get a Cesium ion token', setup: 'Google 3D setup guide',
    token: 'Cesium ion access token', placeholder: 'Paste your browser access token',
    reveal: 'Show token', conceal: 'Hide token', close: 'Close API settings',
    privacy: 'Stored only in this browser. RELIC does not send your token to its server. When you activate Google 3D, it is sent to the imagery provider.',
    restriction: 'Use a browser token restricted to this app’s URL and the required assets. Do not enter account passwords or administrator credentials.',
    saved: 'Token saved in this browser.', temporary: 'Local saving is blocked. The token is available for this tab only.',
    cleared: 'API keys removed from this browser.', clearBlocked: 'Cleared for this tab. Browser restrictions prevented clearing persistent storage.',
    invalid: 'Paste a complete Cesium ion access token, not a URL or account password.', empty: 'Enter your Cesium ion access token.',
    save: 'Save locally', enable: 'Save and use Google 3D', remove: 'Remove token', clearAll: 'Clear all API keys', cancel: 'Cancel',
    available: 'No key required', nasa: 'NASA imagery and planetary terrain', sources: 'Public NASA/JPL data sources',
  },
  fr: {
    title: 'Clés API', lead: 'Vos clés. Votre navigateur.',
    description: 'Le système solaire, les images NASA et les reliefs de la Lune et de Mars fonctionnent sans clé API.',
    provider: 'Cesium ion', optional: 'Facultatif · Google 3D photoréaliste',
    providerCopy: 'Pour explorer les images 3D de Google sur Terre, utilisez votre propre jeton navigateur Cesium ion et activez la ressource Google Photorealistic 3D Tiles dans votre compte ion. Les quotas et conditions du fournisseur s’appliquent.',
    create: 'Obtenir un jeton Cesium ion', setup: 'Guide de configuration Google 3D',
    token: 'Jeton d’accès Cesium ion', placeholder: 'Collez votre jeton d’accès navigateur',
    reveal: 'Afficher le jeton', conceal: 'Masquer le jeton', close: 'Fermer les réglages API',
    privacy: 'Enregistré uniquement dans ce navigateur. RELIC n’envoie pas votre jeton à son serveur. Quand vous activez Google 3D, il est transmis au fournisseur des images.',
    restriction: 'Utilisez un jeton navigateur limité à l’URL de cette application et aux ressources nécessaires. Ne saisissez ni mot de passe de compte ni identifiant d’administration.',
    saved: 'Jeton enregistré dans ce navigateur.', temporary: 'L’enregistrement local est bloqué. Le jeton reste disponible uniquement dans cet onglet.',
    cleared: 'Clés API supprimées de ce navigateur.', clearBlocked: 'Effacé pour cet onglet. Le navigateur a empêché la suppression du stockage persistant.',
    invalid: 'Collez un jeton d’accès Cesium ion complet, et non une URL ou un mot de passe de compte.', empty: 'Saisissez votre jeton d’accès Cesium ion.',
    save: 'Enregistrer en local', enable: 'Enregistrer et utiliser Google 3D', remove: 'Supprimer le jeton', clearAll: 'Effacer toutes les clés API', cancel: 'Annuler',
    available: 'Aucune clé nécessaire', nasa: 'Images NASA et reliefs planétaires', sources: 'Sources publiques NASA/JPL',
  },
};

let activeDialog = null;
let configuredLanguage = null;
const boundButtons = new WeakMap();
const eye = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;

function language(requested) {
  let current = requested;
  if (!current && configuredLanguage) current = configuredLanguage();
  if (!current) current = document.documentElement.lang;
  return current === 'fr' ? 'fr' : 'en';
}

function ensureStyles() {
  if (document.querySelector('link[data-relic-api-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./api-settings.css', import.meta.url).href;
  link.dataset.relicApiStyles = '';
  document.head.append(link);
}

/** Resolve with the selected token, or an empty string on cancel. */
export function openApiSettings({ purpose = 'settings', language: requestedLanguage, onSave } = {}) {
  if (activeDialog) { activeDialog.dialog.focus(); return activeDialog.promise; }
  ensureStyles();
  const copy = COPY[language(requestedLanguage)];
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className = 'relic-api-dialog';
  dialog.setAttribute('aria-labelledby', 'relic-api-title');
  dialog.setAttribute('aria-describedby', 'relic-api-description');
  dialog.innerHTML = `<form class="relic-api-form" novalidate>
    <header class="relic-api-header"><div><p class="relic-api-eyebrow">RELIC</p><h2 id="relic-api-title">${copy.title}</h2></div><button class="relic-api-close" type="button" aria-label="${copy.close}"><span aria-hidden="true">×</span></button></header>
    <p class="relic-api-lead">${copy.lead}</p><p id="relic-api-description">${copy.description}</p>
    <section class="relic-api-provider" aria-labelledby="relic-api-provider-title"><p class="relic-api-status">${copy.optional}</p><h3 id="relic-api-provider-title">${copy.provider}</h3><p>${copy.providerCopy}</p><div class="relic-api-links"><a href="https://ion.cesium.com/tokens" target="_blank" rel="noopener noreferrer">${copy.create} ↗</a><a href="https://cesium.com/learn/ion/google-photorealistic-3d-tiles/" target="_blank" rel="noopener noreferrer">${copy.setup} ↗</a></div>
      <label for="relic-cesium-token">${copy.token}</label><div class="relic-api-input-row"><input id="relic-cesium-token" name="cesium-ion-token" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="8192" placeholder="${copy.placeholder}" aria-describedby="relic-api-privacy relic-api-restriction relic-api-message"><button class="relic-api-reveal" type="button" aria-label="${copy.reveal}" aria-pressed="false">${eye}</button></div>
      <p class="relic-api-note" id="relic-api-privacy">${copy.privacy}</p><p class="relic-api-note" id="relic-api-restriction">${copy.restriction}</p><button class="relic-api-remove" type="button">${copy.remove}</button>
    </section>
    <section class="relic-api-keyless"><span aria-hidden="true">✓</span><div><h3>${copy.nasa}</h3><p>${copy.available} · ${copy.sources}</p></div></section>
    <p class="relic-api-message" id="relic-api-message" role="status" aria-live="polite"></p>
    <footer class="relic-api-actions"><button class="relic-api-clear" type="button">${copy.clearAll}</button><div><button class="relic-api-cancel" type="button">${copy.cancel}</button><button class="relic-api-save" type="submit">${purpose === 'google3d' ? copy.enable : copy.save}</button></div></footer>
  </form>`;
  const input = dialog.querySelector('input');
  input.value = getCesiumToken();
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  activeDialog = { dialog, promise };
  const message = dialog.querySelector('.relic-api-message');
  const close = token => {
    if (activeDialog?.dialog !== dialog) return;
    activeDialog = null;
    dialog.close();
    input.value = '';
    dialog.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    resolve(token);
  };
  dialog.querySelector('.relic-api-close').addEventListener('click', () => close(''));
  dialog.querySelector('.relic-api-cancel').addEventListener('click', () => close(''));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(''); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close('');
  });
  dialog.querySelector('.relic-api-reveal').addEventListener('click', event => {
    const shown = input.type === 'password';
    input.type = shown ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-pressed', String(shown));
    event.currentTarget.setAttribute('aria-label', shown ? copy.conceal : copy.reveal);
  });
  function clear() {
    const result = clearApiKeys(); input.value = ''; input.removeAttribute('aria-invalid');
    message.dataset.state = result.persistent ? 'success' : 'notice';
    message.textContent = result.persistent ? copy.cleared : copy.clearBlocked;
    if (typeof onSave === 'function') onSave(result);
  }
  dialog.querySelector('.relic-api-remove').addEventListener('click', clear);
  dialog.querySelector('.relic-api-clear').addEventListener('click', clear);
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const issue = validateCesiumToken(input.value);
    if (issue) {
      input.setAttribute('aria-invalid', 'true'); message.dataset.state = 'error';
      message.textContent = issue === 'empty' ? copy.empty : copy.invalid; input.focus(); return;
    }
    const token = input.value.trim();
    const result = setCesiumToken(token);
    input.removeAttribute('aria-invalid'); message.dataset.state = result.persistent ? 'success' : 'notice';
    message.textContent = result.persistent ? copy.saved : copy.temporary;
    if (typeof onSave === 'function') onSave(result);
    if (purpose === 'google3d') close(token);
  });
  document.body.append(dialog);
  dialog.showModal();
  // Avoid opening a software keyboard on every settings visit.
  dialog.querySelector('.relic-api-close').focus({ preventScroll: true });
  return promise;
}

export function initializeApiSettings({ button = document.querySelector('#relic-settings'), getLanguage, onSave } = {}) {
  if (typeof getLanguage === 'function') configuredLanguage = getLanguage;
  if (!button || boundButtons.has(button)) return () => {};
  const listener = () => { openApiSettings({ onSave }); };
  button.addEventListener('click', listener); boundButtons.set(button, listener);
  return () => { button.removeEventListener('click', listener); boundButtons.delete(button); };
}
