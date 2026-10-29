import { getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { worldIcon } from './world-icons.js';
import { PROLOGUE_MEDIA } from '../../intro/prologue-data-v8.js';

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
  heading(content, french() ? 'Lunes et ceintures' : 'Moons and small-body belts');
  paragraph(content, french()
    ? 'Le catalogue comprend 456 satellites des huit planètes : 455 orbites moyennes JPL et un petit satellite de Saturne sans éléments publiés. Les positions des lunes sont indicatives. Les ceintures principale et de Kuiper sont des populations statistiques ; elles ne donnent pas les positions mesurées des objets individuels.'
    : 'The catalogue covers 456 moons of the eight planets: 455 JPL mean orbits and one Saturnian moonlet without published elements. Moon positions are illustrative. The main and Kuiper belts are statistical populations; they do not give measured positions of individual objects.');
  sourceLink(content, 'NASA/JPL · satellite mean elements', 'https://ssd.jpl.nasa.gov/sats/elem/');
  sourceLink(content, 'NASA/JPL · discovery catalogue', 'https://ssd.jpl.nasa.gov/sats/discovery.html');
  paragraph(content, french()
    ? 'Textures des principales lunes : NASA/VTAD (modèles 3D officiels), et NASA/LROC pour la Lune. Les autres corps utilisent des formes illustratives, avec les dimensions inconnues explicitement indiquées.'
    : 'Major-moon textures: NASA/VTAD official 3D models, and NASA/LROC for the Moon. Other bodies use illustrative shapes, with unmeasured dimensions explicitly identified.');
  sourceLink(content, 'NASA · 3D resources', 'https://science.nasa.gov/resources/3d-resources/');
  heading(content, french() ? '67P, Philae et Rosetta' : '67P, Philae and Rosetta');
  paragraph(content, french()
    ? 'La trajectoire héliocentrique de 67P utilise les états JPL Horizons de 2025 à 2033, interpolés avec leurs vitesses. Le noyau utilise le maillage mesuré OSIRIS SHAP5. Les sites finaux de Philae et Rosetta sont placés avec les coordonnées des noyaux ESA SPICE, dans le même repère Cheops. Les appareils sont des schémas agrandis ; leur attitude actuelle et la phase de rotation actuelle de la comète ne sont pas connues.'
    : '67P’s heliocentric trajectory uses JPL Horizons states from 2025 to 2033, interpolated with their velocities. The nucleus uses the measured OSIRIS SHAP5 mesh. Philae and Rosetta’s final sites use ESA SPICE kernel coordinates in the same Cheops frame. Hardware models are enlarged schematics; present hardware attitudes and the comet’s present spin phase are unknown.');
  sourceLink(content, '67P · provenance et crédits / provenance and credits', new URL('../../assets/comets/67p/provenance.json', import.meta.url).href);
  sourceLink(content, 'NASA/JPL Horizons', 'https://ssd.jpl.nasa.gov/horizons/');
  sourceLink(content, 'ESA / NAIF · Rosetta scientific archive', 'https://naif.jpl.nasa.gov/pub/naif/ROSETTA/');
  paragraph(content, french()
    ? 'L’éclairage suit la direction du Soleil à la date de simulation affichée. Les huit planètes utilisent les orientations cartographiques IAU du noyau NAIF PCK. Les textures sont des images d’archives ; elles ne donnent pas la météo actuelle. La vitesse du calendrier est réglable ; les traînées bleues suivent les mêmes positions que les planètes. La vue verrouillée fige le temps pendant l’exploration. Une faible lumière nocturne facilite la lecture ; les éclipses et ombres portées des anneaux ne sont pas simulées.'
    : 'Illumination follows the Sun’s direction at the displayed simulation date. The eight planets use IAU cartographic orientations from the NAIF PCK kernel. Textures are archival imagery, not current weather. The calendar speed is adjustable; blue trails follow the same positions as the planets. Locked views hold model time still while exploring. Faint night-side fill aids readability; eclipses and cast ring shadows are not simulated.');
  sourceLink(content, 'NASA/NAIF · IAU planetary orientation', 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc');
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
    ? 'Les tailles et les distances sont adaptées pour faciliter la lecture de la vue solaire. Les systèmes locaux utilisent une échelle proportionnelle des distances ; les très petites lunes sont agrandies pour rester sélectionnables.'
    : 'Sizes and distances are adapted for readability in the solar overview. Local moon systems use proportional distances; very small moons are enlarged to remain selectable.','relic-sources-note');
  heading(content, french() ? 'Le film' : 'The film');
  const minutes = Math.floor(PROLOGUE_MEDIA.duration / 60);
  const seconds = Math.round(PROLOGUE_MEDIA.duration % 60);
  paragraph(content, french()
    ? `Un documentaire de ${minutes} min ${String(seconds).padStart(2, '0')}, exporté en 1080p50 à partir des meilleures sources disponibles. Les archives de définition inférieure sont agrandies et leur cadence adaptée ; cela ne recrée pas de détails manquants. Les origines et certaines missions utilisent des animations ; les dinosaures sont des reconstitutions. La narration nouvelle utilise des voix de synthèse en anglais et en français. Les voix historiques sont des enregistrements originaux.`
    : `A ${minutes}-minute ${seconds}-second documentary exported at 1080p50 from the best available source footage. Lower-resolution archives are upscaled and their frame rates resampled; this does not recreate missing detail. The origins and some missions use animations; dinosaurs are reconstructed. New narration uses synthetic voices in English and French. Historical voices are original recordings.`);
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
