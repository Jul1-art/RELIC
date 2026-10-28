import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';

const INTRO_ROOT = new URL('../../intro/', import.meta.url);
const french = () => getLanguage() === 'fr';
const localize = value => typeof value === 'string' ? value : value?.[getLanguage()] || value?.en || '';
let activeDialog = null;
let provenanceCache = null;

function ensureStyles() {
  if (document.querySelector('link[data-relic-sources-style],link[href*="app-sources.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = new URL('./app-sources.css', import.meta.url).href;
  link.dataset.relicSourcesStyle = ''; document.head.append(link);
}
ensureStyles();

function safeURL(value) {
  try { const url = new URL(value, INTRO_ROOT); return /^https?:$/.test(url.protocol) ? url.href : null; }
  catch { return null; }
}
const paragraph = (parent, text, className = '') => {
  const element = document.createElement('p'); element.textContent = text; element.className = className; parent.append(element); return element;
};
function sourceLink(parent, label, href) {
  const url = safeURL(href);
  if (!url) return;
  const link = document.createElement('a'); link.href = url; link.textContent = label;
  link.target = '_blank'; link.rel = 'noopener noreferrer'; parent.append(link);
}
function heading(parent, text) {
  const element = document.createElement('h3'); element.textContent = text; parent.append(element); return element;
}

function createDialog(trigger) {
  const previousFocus = trigger || document.activeElement;
  const introduction = document.querySelector('#intro');
  const video = introduction?.querySelector('video');
  if (window.__relicFilmActive && introduction) { video?.pause(); introduction.inert = true; }
  const request = new AbortController();
  const dialog = document.createElement('dialog'); dialog.className = 'relic-sources-dialog';
  dialog.id = 'relic-app-sources'; dialog.setAttribute('aria-labelledby', 'relic-sources-title');
  dialog.innerHTML = `<header class="relic-sources-header"><div><p class="relic-sources-eyebrow"><img class="relic-dialog-logo" src="${new URL('../../assets/relic-logo-v1.png', import.meta.url).href}" alt="" width="26" height="23">RELIC</p><h2 id="relic-sources-title"></h2></div><button type="button" class="relic-sources-close">${worldIcon('xmark')}</button></header><div class="relic-sources-content"></div>`;
  dialog.querySelector('h2').textContent = french() ? 'Sources et créateurs' : 'Sources and creators';
  const close = dialog.querySelector('.relic-sources-close');
  close.setAttribute('aria-label', french() ? 'Fermer les sources' : 'Close sources');
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    request.abort();
    if (activeDialog === dialog) activeDialog = null;
    if (introduction) introduction.inert = false;
    dialog.remove();
    const target = previousFocus?.isConnected && previousFocus.getClientRects().length && !previousFocus.closest('[inert],[hidden]')
      ? previousFocus : document.querySelector('#relic-credits');
    target?.focus({preventScroll:true});
  }, {once:true});
  document.body.append(dialog); activeDialog = dialog; dialog.showModal(); close.focus({preventScroll:true});
  return {dialog, content:dialog.querySelector('.relic-sources-content'), signal:request.signal};
}

/** Opens inside the current document. Planet renderers and the film are untouched. */
export async function openSources(trigger) {
  if (activeDialog?.open) { activeDialog.querySelector('.relic-sources-close').focus({preventScroll:true}); return; }
  const {dialog,content,signal} = createDialog(trigger);
  paragraph(content, french() ? 'Explorer ce que nous avons laissé derrière nous.' : 'Explore what we left behind.', 'relic-sources-lead');
  const people = document.createElement('div'); people.className = 'relic-sources-people'; content.append(people);
  for (const [name, role] of [['Jules',french() ? 'Développement et interface' : 'Development and interface'],['Hugo',french() ? 'Recherche spatiale et récits' : 'Space research and storytelling']]) {
    const card = document.createElement('div'); card.className = 'relic-creator';
    const avatar = document.createElement('span'); avatar.className = 'relic-creator-avatar'; avatar.setAttribute('aria-hidden','true');
    const initial = document.createElement('span'); initial.textContent = name[0]; avatar.append(initial);
    if (name === 'Jules') {
      const image = document.createElement('img'); image.src = new URL('../../assets/jules-avatar.jpg', import.meta.url).href;
      image.alt = ''; image.width = 56; image.height = 56; image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), {once:true}); avatar.append(image);
    }
    const identity = document.createElement('div'); identity.className = 'relic-creator-identity'; heading(identity,name); paragraph(identity,role);
    card.append(avatar,identity); people.append(card);
  }
  heading(content, french() ? 'Atlas et données' : 'Atlas and data');
  const sources = document.createElement('div'); sources.className = 'relic-sources-links'; content.append(sources);
  for (const [label, url] of [
    ['NASA Open Data','https://data.nasa.gov/'],['NASA / JPL Horizons','https://ssd.jpl.nasa.gov/horizons/'],
    ['JPL · approximate planetary positions','https://ssd.jpl.nasa.gov/planets/approx_pos.html'],
    ['NOAA SWPC · solar wind','https://www.swpc.noaa.gov/products/real-time-solar-wind'],
    ['Photon / OpenStreetMap','https://photon.komoot.io/'],
    ['Open-Meteo / GeoNames · CC BY 4.0','https://open-meteo.com/en/docs/geocoding-api'],
    ['NASA Solar System Exploration','https://science.nasa.gov/solar-system/'],['NASA / LRO lunar imagery','https://wms.lroc.asu.edu/lroc'],
    ['NASA Mars Trek','https://trek.nasa.gov/mars/'],['Solar System Scope / INOVE · CC BY 4.0','https://www.solarsystemscope.com/textures/'],
    ['Three.js · MIT','https://threejs.org/'],['CesiumJS · Apache 2.0','https://cesium.com/platform/cesiumjs/'],
  ]) sourceLink(sources,label,url);
  paragraph(content,french()
    ? 'Les tailles et les distances sont adaptées pour faciliter la lecture. Le mouvement bleu des orbites indique le sens de parcours avec une vitesse illustrative, distincte de la vitesse réelle des planètes.'
    : 'Sizes and distances are adapted for readability. Blue orbital motion shows the direction of travel at an illustrative speed, distinct from the planets’ real speeds.','relic-sources-note');
  heading(content, french() ? 'Le film' : 'The film');
  paragraph(content, french()
    ? 'Un documentaire de 9 min 29, exporté en 1080p50 à partir des meilleures sources disponibles. Les archives de définition inférieure sont agrandies et leur cadence adaptée ; cela ne recrée pas de détails manquants. Les origines et certaines missions utilisent des animations ; les dinosaures sont des reconstitutions. La narration nouvelle utilise des voix de synthèse en anglais et en français. Les voix historiques sont des enregistrements originaux.'
    : 'A 9-minute 29-second documentary exported at 1080p50 from the best available source footage. Lower-resolution archives are upscaled and their frame rates resampled; this does not recreate missing detail. The origins and some missions use animations; dinosaurs are reconstructed. New narration uses synthetic voices in English and French. Historical voices are original recordings.');
  paragraph(content,'“Helios” — Scott Buckley · CC BY 4.0','relic-sources-music');
  const filmSources = document.createElement('div'); filmSources.className = 'relic-sources-links'; content.append(filmSources);
  for (const [label,url] of [
    ['Scott Buckley · Helios','https://www.scottbuckley.com.au/library/helios/'],
    ['Font Awesome Free · icons','https://fontawesome.com/license/free'],
    ['Kokoro · synthetic narration','https://huggingface.co/hexgrad/Kokoro-82M'],
    [french() ? 'Provenance, dates et licences' : 'Provenance, dates and licenses',new URL('assets/prologue/sources-v9.json',INTRO_ROOT).href],
  ]) sourceLink(filmSources,label,url);
  const catalogue = document.createElement('details'); catalogue.className = 'relic-sources-catalogue';
  const summary = document.createElement('summary'); summary.textContent = french() ? 'Catalogue des archives' : 'Archive catalogue'; catalogue.append(summary);
  const archiveLinks = document.createElement('div'); archiveLinks.className = 'relic-sources-links'; catalogue.append(archiveLinks); content.append(catalogue);
  paragraph(content,french()
    ? 'RELIC est un projet indépendant. Le code de l’application et les médias possèdent leurs propres licences ; les images et archives ne sont pas toutes sous licence Apache 2.0.'
    : 'RELIC is an independent project. Application code and media have separate licenses; imagery and archive footage are not all licensed under Apache 2.0.','relic-sources-note');
  try {
    if (!provenanceCache) {
      const response = await fetch(new URL('assets/prologue/sources-v9.json',INTRO_ROOT), {signal});
      if (!response.ok) return;
      provenanceCache = await response.json();
    }
    if (!dialog.open) return;
    const seen = new Set([...filmSources.querySelectorAll('a')].map(link=>link.href));
    function collect(value,depth=0) {
      if (!value || typeof value !== 'object' || depth>12) return;
      if (typeof value.sourcePage === 'string') {
        const url = safeURL(value.sourcePage);
        if (url && !seen.has(url)) { seen.add(url); sourceLink(archiveLinks,localize(value.credit || value.title || value.id) || new URL(url).hostname,url); }
      }
      for (const item of Object.values(value)) if (item && typeof item === 'object') collect(item,depth+1);
    }
    collect(provenanceCache.currentAdditionalSources); collect(provenanceCache.inheritedLicensedSourceCatalog);
    if (!archiveLinks.childElementCount) catalogue.hidden = true;
  } catch { catalogue.hidden = true; /* The provenance link remains usable offline. */ }
}

onLanguageChange(() => activeDialog?.close());
