import * as Cesium from './vendor/cesium/index.js';
Cesium.Ion.defaultAccessToken = ''; // RELIC uses only a user-supplied token for optional ion assets.
import { EARTH_SITES, NASA_IMAGERY } from './nasa-worlds.js';
import { createMeasuredTerrain } from './earth-terrain.js';
import { createDetailedEarthImagery, ESRI_IMAGERY_URL } from './earth-imagery.js';
import { createGoogle3D, askForCesiumToken } from './google-3d.js';
import { createPlaceSearch } from './place-search.js?v=5';
import { startLiveData, getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { configureWorldPerformance, cameraDuration, flyToLocation } from './world-performance.js';

const $ = selector => document.querySelector(selector);
const input = $('#place-input');
const dateInput = $('#image-date');
const day = 86400000;
const utcDate = offset => new Date(Date.now() - offset * day).toISOString().slice(0, 10);
dateInput.max = utcDate(1);
dateInput.min = '2000-02-24';
dateInput.value = utcDate(3);

let viewer;
let currentLayer;
let remoteLayer;
let localLayer;
let selectedSite;
let layerSerial = 0;
let siteFocusSerial = 0;
let google3D;
let googleState = { status:'missing', active:false };
let placeSearch;
const englishSites = {
  manhattan:{ tag:'3D CITY', description:'Explore Midtown with Google photorealistic 3D tiles when Cesium ion is enabled.' },
  paris:{ tag:'3D CITY', description:'Explore central Paris with Google photorealistic 3D tiles when Cesium ion is enabled.' },
  'nice-airport':{ name:'Nice Airport', tag:'RUNWAYS · CORRECTED TERRAIN', description:'In NASA mode, both runways are blended into measured terrain using their published French AIP elevations.', sourceLabel:'VIEW OFFICIAL RUNWAY ELEVATIONS ↗' },
  kennedy:{ tag:'ISS VIEW', description:'The Florida launch site as seen from the International Space Station.' },
  'grand-canyon':{ tag:'ISS LANDSCAPE', description:'A landscape photographed from the International Space Station.' },
  nile:{ name:'Nile Delta', tag:'ISS VIEW', description:'The green delta stands out against the desert in orbital observations.' },
};
const english = () => getLanguage() === 'en';
const siteText = site => english() ? { ...site, ...englishSites[site.id] } : site;

function status(text) { $('#search-state').textContent = text; }
function layerNoteText() {
  const en = english();
  if (googleState.active) return en
    ? 'Photorealistic Google 3D tiles via Cesium ion.'
    : 'Tuiles 3D photoréalistes Google via Cesium ion.';
  return currentLayer === 'satellite'
    ? (en ? 'Esri imagery · NASA SRTM terrain.' : 'Imagerie Esri · relief NASA SRTM.')
    : currentLayer === 'modis'
      ? (en ? `MODIS · ${dateInput.value} · 250 m/px.` : `MODIS · ${dateInput.value} · 250 m/px.`)
      : (en ? 'NASA Blue Marble · historical mosaic.' : 'NASA Blue Marble · mosaïque historique.');
}
function showGoogleState(state) {
  googleState = state;
  const en = english();
  $('#google3d-toggle').setAttribute('aria-pressed', String(state.active));
  $('#google3d-status').textContent = state.status === 'ready'
    ? (en ? 'Active' : 'Actif')
    : state.status === 'loading' ? (en ? 'Loading…' : 'Chargement…')
      : state.status === 'error' ? (en ? 'Google 3D unavailable' : 'Google 3D indisponible')
        : state.status === 'off' ? (en ? 'NASA terrain' : 'Relief NASA')
          : (en ? 'Google 3D unavailable' : 'Google 3D indisponible');
  $('.earth-attribution').hidden = state.active;
  document.body.dataset.google3d = String(state.active);
  $('#layer-note').textContent = layerNoteText();
}
function hideSuggestions() { placeSearch?.close(); }
function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}
async function selectSite(site) {
  if (!viewer) return;
  selectedSite = site;
  viewer.scene.verticalExaggeration = !site.id || ['manhattan', 'paris', 'nice-airport'].includes(site.id) ? 1 : 2;
  $('#earth-terrain-status').textContent = english()
    ? ` · MEASURED SRTM RELIEF · ×${viewer.scene.verticalExaggeration}`
    : ` · RELIEF SRTM MESURÉ · ×${viewer.scene.verticalExaggeration}`;
  const shown = siteText(site);
  hideSuggestions();
  input.value = shown.inputLabel || shown.name;
  $('#location-tag').textContent = shown.tag || (english() ? 'COORDINATES' : 'COORDONNÉES');
  $('#location-name').textContent = shown.name;
  $('#location-description').textContent = shown.description || (english() ? 'Location defined by geographic coordinates.' : 'Position définie par ses coordonnées géographiques.');
  $('#latitude').textContent = formatCoordinate(site.lat, 'N', 'S');
  $('#longitude').textContent = formatCoordinate(site.lon, 'E', 'O');
  $('#location-source').href = site.source || NASA_IMAGERY.gibsInfo;
  $('#location-source').textContent = shown.sourceLabel || (english() ? 'Source ↗' : 'Source ↗');
  $('#location-3d').hidden = false;
  $('#location-3d').href = site.id
    ? `./terrain.html?body=earth&site=${encodeURIComponent(site.id)}`
    : `./terrain.html?body=earth&lat=${site.lat}&lon=${site.lon}`;
  $('#site-summary').hidden = false;
  status('');
  const serial = ++siteFocusSerial;
  flyToLocation(viewer, Cesium, { lat:site.lat, lon:site.lon, ellipsoid:Cesium.Ellipsoid.WGS84,
    range:site.range || 460000, duration:.85, sphereRadius:1000,
    current:() => serial === siteFocusSerial && !document.hidden });
  if (window.matchMedia('(max-width:760px)').matches) collapsePanel(true);
}

function collapsePanel(collapsed) {
  const panel = $('.explorer-panel');
  panel.classList.toggle('collapsed', collapsed);
  $('#panel-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#panel-toggle').setAttribute('aria-label', collapsed ? 'Afficher les données' : 'Réduire le panneau');
}

function imageryProvider(url, level, credit) {
  return new Cesium.UrlTemplateImageryProvider({
    url,
    tilingScheme:new Cesium.WebMercatorTilingScheme(),
    maximumLevel:level,
    credit,
    enablePickFeatures:false,
  });
}

async function setLayer(id) {
  if (!viewer) return;
  if (id === currentLayer && id !== 'modis') return;
  const serial = ++layerSerial;
  const date = dateInput.value;
  if (id === 'modis' && (!date || date < dateInput.min || date > dateInput.max)) {
    status(english() ? 'Choose a valid date between 24 February 2000 and yesterday.' : 'Choisissez une date valide entre le 24 février 2000 et hier.');
    return;
  }
  let provider;
  try {
    provider = id === 'satellite'
      ? await createDetailedEarthImagery(Cesium)
      : id === 'modis'
        ? imageryProvider(NASA_IMAGERY.earthModis(date), 9, 'NASA GIBS · MODIS Terra')
        : imageryProvider(NASA_IMAGERY.earthBlueMarble, 8, 'NASA GIBS · Blue Marble Next Generation');
  } catch (error) {
    console.warn('Imagerie satellite détaillée indisponible', error);
    if (id === 'satellite') return setLayer('blue');
    return;
  }
  if (serial !== layerSerial || viewer.isDestroyed()) return;
  const nextLayer = viewer.imageryLayers.addImageryProvider(provider);
  if (remoteLayer) viewer.imageryLayers.remove(remoteLayer, true);
  remoteLayer = nextLayer;
  currentLayer = id;
  $('#date-field').hidden = id !== 'modis';
  $('#layer-note').textContent = layerNoteText();
  $('#earth-imagery-credit').href = id === 'satellite' ? ESRI_IMAGERY_URL : NASA_IMAGERY.gibsInfo;
  $('#earth-imagery-credit').textContent = id === 'satellite'
    ? 'POWERED BY ESRI · ESRI, MAXAR, EARTHSTAR GEOGRAPHICS, GIS USER COMMUNITY'
    : 'NASA GIBS';
  document.querySelectorAll('[data-layer]').forEach(button => {
    const active = button.dataset.layer === id;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  status('');
  // Keep the local NASA image below the live layer if a network tile is absent.
  if (localLayer) viewer.imageryLayers.lowerToBottom(localLayer);
}

async function start() {
  try {
    const terrainProvider = createMeasuredTerrain('earth', Cesium.Ellipsoid.WGS84, available => {
      $('#earth-terrain-status').textContent = available
        ? (english() ? ` · MEASURED SRTM RELIEF · ×${viewer?.scene.verticalExaggeration || 2}` : ` · RELIEF SRTM MESURÉ · ×${viewer?.scene.verticalExaggeration || 2}`)
        : (english() ? ' · WGS84 ELLIPSOID · IMAGERY' : ' · ELLIPSOÏDE WGS84 · IMAGERIE');
      $('#earth-terrain-status').dataset.available = String(available);
    });
    viewer = new Cesium.Viewer($('#globe'), {
      timeline:false, animation:false, baseLayerPicker:false, geocoder:false,
      homeButton:false, sceneModePicker:false, navigationHelpButton:false,
      fullscreenButton:false, vrButton:false, selectionIndicator:false,
      infoBox:false, baseLayer:false, terrainProvider, creditContainer:$('#cesium-credits'),
      msaaSamples:window.innerWidth <= 760 ? 1 : 2,
    });
    configureWorldPerformance(viewer, { onSuspend:() => { siteFocusSerial++; viewer.camera.cancelFlight(); } });
    viewer.scene.canvas.addEventListener('pointerdown', () => { siteFocusSerial++; }, { passive:true });
    viewer.scene.canvas.addEventListener('wheel', () => { siteFocusSerial++; }, { passive:true });
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.verticalExaggeration = 2;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 55000000;
    viewer.camera.setView({ destination:Cesium.Cartesian3.fromDegrees(12, 25, 16000000) });
    google3D = createGoogle3D(viewer, showGoogleState);

    // The globe is interactive as soon as its first frame exists. Imagery and
    // optional photorealistic tiles refine it without holding the interface.
    viewer.scene.postRender.addEventListener(function ready() {
      $('#earth-loading').classList.add('done');
      viewer.scene.postRender.removeEventListener(ready);
    });
    viewer.scene.requestRender();
    Cesium.SingleTileImageryProvider.fromUrl(new URL('./assets/earth-blue-marble-4k.webp', import.meta.url).href, {
      credit:'NASA · Blue Marble',
    }).then(provider => {
      if (viewer.isDestroyed()) return;
      localLayer = viewer.imageryLayers.addImageryProvider(provider);
      viewer.imageryLayers.lowerToBottom(localLayer);
      viewer.scene.requestRender();
    }).catch(() => { /* The live layer can still supply the map. */ });
    setLayer('satellite');
    google3D.enable();
  } catch (error) {
    console.error('Globe NASA indisponible :', error);
    $('#earth-error').textContent = 'Le rendu 3D est indisponible sur ce navigateur. Activez l’accélération graphique puis réessayez.';
    $('#earth-error').hidden = false;
    $('#earth-loading').classList.add('done');
  }
}

placeSearch = createPlaceSearch({
  world:'earth',
  places:() => EARTH_SITES.map(site => ({ ...site, name:siteText(site).name, tag:siteText(site).tag })),
  language:getLanguage,
  getBias:() => {
    if (!viewer || viewer.camera.positionCartographic.height > 2_000_000) return null;
    const canvas = viewer.scene.canvas;
    const point = viewer.camera.pickEllipsoid(new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2));
    if (!point) return null;
    const cartographic = Cesium.Cartographic.fromCartesian(point);
    return { lat:Cesium.Math.toDegrees(cartographic.latitude), lon:Cesium.Math.toDegrees(cartographic.longitude) };
  },
  onSelect:place => {
    if (place.source === 'nasa') return selectSite(EARTH_SITES.find(site => site.id === place.site.id));
    const searched = ['photon', 'geocoder'].includes(place.source);
    const fromPhoton = place.source === 'photon';
    return selectSite({
      name:place.name,
      inputLabel:place.detail ? `${place.name}, ${place.detail}` : place.name,
      lat:place.lat, lon:place.lon, range:place.range,
      tag:searched ? (english() ? 'SEARCHED PLACE' : 'LIEU RECHERCHÉ') : (english() ? 'COORDINATES' : 'COORDONNÉES'),
      description:place.detail || (english() ? 'Geographic coordinates.' : 'Coordonnées géographiques.'),
      source:place.sourceUrl || (fromPhoton ? `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=16/${place.lat}/${place.lon}` : undefined),
      sourceLabel:fromPhoton ? (english() ? 'VIEW ON OPENSTREETMAP ↗' : 'VOIR SUR OPENSTREETMAP ↗')
        : searched ? (english() ? 'VIEW PLACE SOURCE ↗' : 'VOIR LA SOURCE DU LIEU ↗') : undefined,
    });
  },
});
$('#panel-toggle').addEventListener('click', () => collapsePanel(!$('.explorer-panel').classList.contains('collapsed')));
$('#site-close').addEventListener('click', () => { $('#site-summary').hidden = true; });
function showMapOptions(open) {
  $('#map-options').hidden = !open;
  $('#map-options-toggle').setAttribute('aria-expanded', String(open));
}
$('#map-options-toggle').addEventListener('click', () => showMapOptions($('#map-options').hidden));
document.addEventListener('pointerdown', event => {
  if (!$('#map-options').hidden && !event.target.closest('#map-options, #map-options-toggle')) showMapOptions(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#map-options').hidden) showMapOptions(false);
});
document.querySelectorAll('[data-layer]').forEach(button => button.addEventListener('click', () => setLayer(button.dataset.layer)));
dateInput.addEventListener('change', () => setLayer('modis'));
$('#reset-view').addEventListener('click', () => {
  siteFocusSerial++;
  if (viewer) viewer.scene.verticalExaggeration = 2;
  viewer?.camera.cancelFlight();
  viewer?.camera.flyTo({ destination:Cesium.Cartesian3.fromDegrees(12, 25, 16000000), duration:cameraDuration(.85) });
  $('#site-summary').hidden = true;
  input.value = '';
  hideSuggestions();
});
$('#google3d-toggle').addEventListener('click', async () => {
  if (!google3D) return;
  if (google3D.active) { google3D.disable(); return; }
  let token;
  if (!google3D.hasToken() || google3D.status === 'error') token = await askForCesiumToken();
  if (token === '') return;
  await google3D.enable(token);
});
start();
startLiveData($('#earth-live-data'), () => 'earth');
onLanguageChange(lang => {
  const en = lang === 'en';
  document.title = en ? 'Earth — RELIC' : 'Terre — RELIC';
  $('.back-link span:last-child').textContent = 'RELIC';
  $('.earth-page-title').textContent = en ? 'Earth' : 'Terre';
  $('.world-nav [data-world="earth"]')?.replaceChildren(document.createTextNode(en ? 'Earth' : 'Terre'));
  $('.world-nav [data-world="mars"]')?.replaceChildren(document.createTextNode('Mars'));
  $('.world-nav [data-world="moon"]')?.replaceChildren(document.createTextNode(en ? 'Moon' : 'Lune'));
  $('#explorer-title').textContent = en ? 'Earth' : 'Terre';
  $('.map-options-title').textContent = en ? 'Imagery' : 'Imagerie';
  $('#map-options-toggle').setAttribute('aria-label', en ? 'Imagery' : 'Imagerie');
  $('#map-options-toggle').title = en ? 'Imagery' : 'Imagerie';
  $('[data-layer="satellite"] small').textContent = 'Esri';
  $('[data-layer="blue"] small').textContent = 'NASA';
  $('[data-layer="modis"] small').textContent = 'Terra';
  $('.date-field label').textContent = en ? 'Date' : 'Date';
  $('.date-field span').textContent = en ? 'Coverage varies by date.' : 'Couverture variable selon la date.';
  placeSearch.setLanguage();
  $('#location-3d').firstChild.textContent = en ? 'Explore in 3D ' : 'Explorer en 3D ';
  $('#reset-view span').textContent = en ? 'Overview' : 'Vue globale';
  ($('#google3d-toggle .world-button-label') || $('#google3d-toggle')).textContent = 'Google 3D';
  showGoogleState(googleState);
  $('#earth-terrain-status').textContent = $('#earth-terrain-status').dataset.available === 'false'
    ? (en ? ' · WGS84 ELLIPSOID · IMAGERY' : ' · ELLIPSOÏDE WGS84 · IMAGERIE')
    : (en ? ` · MEASURED SRTM RELIEF · ×${viewer?.scene.verticalExaggeration || 2}` : ` · RELIEF SRTM MESURÉ · ×${viewer?.scene.verticalExaggeration || 2}`);
  $('#layer-note').textContent = layerNoteText();
  if (selectedSite) {
    const shown = siteText(selectedSite);
    $('#location-tag').textContent = shown.tag || (en ? 'COORDINATES' : 'COORDONNÉES');
    $('#location-name').textContent = shown.name;
    $('#location-description').textContent = shown.description || (en ? 'Location defined by geographic coordinates.' : 'Position définie par ses coordonnées géographiques.');
    $('#location-source').textContent = shown.sourceLabel || 'Source ↗';
    input.value = shown.name;
  }
});
