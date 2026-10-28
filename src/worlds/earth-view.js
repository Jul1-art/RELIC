import * as Cesium from '../../vendor/cesium/index.js';
Cesium.Ion.defaultAccessToken = ''; // RELIC uses only a user-supplied token for optional ion assets.
import { EARTH_SITES, NASA_IMAGERY } from '../atlas/nasa-worlds.js';
import { createMeasuredTerrain } from './earth-terrain.js';
import { createDetailedEarthImagery, ESRI_IMAGERY_URL } from './earth-imagery.js';
import { createGoogle3D, askForCesiumToken } from '../core/google-3d.js';
import { createPlaceSearch } from '../search/place-search.js?v=5';
import { startLiveData, getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { configureWorldPerformance, cameraDuration, flyToLocation, createOverviewFraming } from './world-performance.js';
import { createViewLoading } from '../ui/view-loading.js';
import { initializeProviderCredits } from '../ui/provider-credits.js';

const $ = selector => document.querySelector(selector);
const viewLoading = createViewLoading({ element:$('#earth-loading'), errorElement:$('#earth-error'), getLanguage });
const input = $('#place-input');

let viewer;
let overviewFraming;
let currentLayer;
let remoteLayer;
let localLayer;
let baseImageryReady = false;
let selectedSite;
let layerSerial = 0;
let siteFocusSerial = 0;
let google3D;
let googleState = { status:'missing', active:false };
let placeSearch;
const english = () => getLanguage() === 'en';
const siteText = site => site;

function status(text) { $('#search-state').textContent = text; }
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
}
function hideSuggestions() { placeSearch?.close(); }
function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}
async function selectSite(site) {
  if (!viewer) return;
  overviewFraming?.stop();
  selectedSite = site;
  viewer.scene.verticalExaggeration = site.id ? 2 : 1;
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
  window.dispatchEvent(new CustomEvent('planet-dashboard-panel',{detail:{open:!collapsed}}));
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
  if (id === currentLayer) return;
  const serial = ++layerSerial;
  let provider;
  try {
    provider = id === 'satellite'
      ? await createDetailedEarthImagery(Cesium)
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
  $('#earth-imagery-credit').href = id === 'satellite' ? ESRI_IMAGERY_URL : NASA_IMAGERY.gibsInfo;
  $('#earth-imagery-credit').textContent = id === 'satellite'
    ? 'POWERED BY ESRI · ESRI, MAXAR, EARTHSTAR GEOGRAPHICS, GIS USER COMMUNITY'
    : 'NASA GIBS';
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
      showRenderLoopErrors:false,
      msaaSamples:window.innerWidth <= 760 ? 1 : 2,
    });
    initializeProviderCredits({elements:[$('.earth-attribution'), $('#cesium-credits')]});
    configureWorldPerformance(viewer, {
      loading:viewLoading,
      isReady:() => baseImageryReady && viewer.scene.globe.tilesLoaded,
      onReady:() => { setLayer('satellite'); google3D.enable(); },
      onSuspend:() => { siteFocusSerial++; viewer.camera.cancelFlight(); },
    });
    viewer.scene.canvas.addEventListener('pointerdown', () => { siteFocusSerial++; }, { passive:true });
    viewer.scene.canvas.addEventListener('wheel', () => { siteFocusSerial++; }, { passive:true });
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#102436');
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.verticalExaggeration = 2;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 55000000;
    overviewFraming = createOverviewFraming(viewer, Cesium, { ellipsoid:Cesium.Ellipsoid.WGS84, longitude:12, latitude:25 });
    overviewFraming.show();
    google3D = createGoogle3D(viewer, showGoogleState);

    // Render the packaged NASA base first; live layers and optional 3D tiles
    // refine the visible globe after that first complete image.
    viewer.scene.requestRender();
    Cesium.SingleTileImageryProvider.fromUrl(new URL('../../assets/earth-blue-marble-4k.webp', import.meta.url).href, {
      credit:'NASA · Blue Marble',
    }).then(provider => {
      if (viewer.isDestroyed()) return;
      localLayer = viewer.imageryLayers.addImageryProvider(provider);
      viewer.imageryLayers.lowerToBottom(localLayer);
      baseImageryReady = true;
      viewer.scene.requestRender();
    }).catch(() => { viewLoading.fail(); });
  } catch (error) {
    console.warn('The Earth graphics view could not start.');
    viewLoading.fail();
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
    return selectSite({
      name:place.name,
      inputLabel:place.detail ? `${place.name}, ${place.detail}` : place.name,
      lat:place.lat, lon:place.lon, range:place.range,
      tag:searched ? (english() ? 'SEARCHED PLACE' : 'LIEU RECHERCHÉ') : (english() ? 'COORDINATES' : 'COORDONNÉES'),
      description:place.detail || (english() ? 'Geographic coordinates.' : 'Coordonnées géographiques.'),

    });
  },
});
$('#site-close').addEventListener('click', () => { $('#site-summary').hidden = true; });
$('#reset-view').addEventListener('click', () => {
  siteFocusSerial++;
  if (viewer) viewer.scene.verticalExaggeration = 2;
  overviewFraming?.show(.85);
  $('#site-summary').hidden = true;
  input.value = '';
  hideSuggestions();
});
$('#google3d-toggle').addEventListener('click', async () => {
  overviewFraming?.stop();
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
  viewLoading.refresh();
  const en = lang === 'en';
  document.title = en ? 'Earth — RELIC' : 'Terre — RELIC';
  $('.back-link span:last-child').textContent = 'RELIC';
  $('.earth-page-title').textContent = en ? 'Earth' : 'Terre';
  $('.world-nav [data-world="earth"]')?.replaceChildren(document.createTextNode(en ? 'Earth' : 'Terre'));
  $('.world-nav [data-world="mars"]')?.replaceChildren(document.createTextNode('Mars'));
  $('.world-nav [data-world="moon"]')?.replaceChildren(document.createTextNode(en ? 'Moon' : 'Lune'));
  $('#explorer-title').textContent = en ? 'Earth' : 'Terre';
  placeSearch.setLanguage();
  $('#reset-view span').textContent = en ? 'Overview' : 'Vue globale';
  ($('#google3d-toggle .world-button-label') || $('#google3d-toggle')).textContent = 'Google 3D';
  showGoogleState(googleState);
  $('#earth-terrain-status').textContent = $('#earth-terrain-status').dataset.available === 'false'
    ? (en ? ' · WGS84 ELLIPSOID · IMAGERY' : ' · ELLIPSOÏDE WGS84 · IMAGERIE')
    : (en ? ` · MEASURED SRTM RELIEF · ×${viewer?.scene.verticalExaggeration || 2}` : ` · RELIEF SRTM MESURÉ · ×${viewer?.scene.verticalExaggeration || 2}`);
  if (selectedSite) {
    const shown = siteText(selectedSite);
    $('#location-tag').textContent = shown.tag || (en ? 'COORDINATES' : 'COORDONNÉES');
    $('#location-name').textContent = shown.name;
    $('#location-description').textContent = shown.description || (en ? 'Location defined by geographic coordinates.' : 'Position définie par ses coordonnées géographiques.');
    input.value = shown.name;
  }
});
