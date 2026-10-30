import { appURL } from '../core/paths.js';
import * as Cesium from '../../vendor/cesium/index.js';
Cesium.Ion.defaultAccessToken = ''; // RELIC uses only a user-supplied token for optional ion assets.
import { EARTH_SITES, PLANET_SITES } from '../atlas/nasa-worlds.js';
import { createMeasuredTerrain } from './earth-terrain.js';
import { createDetailedEarthImagery, ESRI_IMAGERY_URL } from './earth-imagery.js';
import { createGoogle3D } from '../core/google-3d.js';
import { createPlaceSearch } from '../search/place-search.js?v=5';
import { startLiveData, getLanguage, onLanguageChange } from '../atlas/atlas-live.js?v=3';
import { configureWorldPerformance, cameraDuration, flyToLocation, createOverviewFraming, TOP_DOWN_PITCH } from './world-performance.js';
import { createViewLoading } from '../ui/view-loading.js';
import { initializeProviderCredits } from '../ui/provider-credits.js?v=14';
import { backendFeatureAvailable, markBackendFeatureUnavailable } from '../core/atlas-services.js';

const $ = selector => document.querySelector(selector);
const viewLoading = createViewLoading({ element:$('#loading'), errorElement:$('#error'), getLanguage });
const query = new URLSearchParams(location.search);
const body = ['earth', 'mars', 'moon'].includes(query.get('body')) ? query.get('body') : 'earth';
const names = { earth:'TERRE', mars:'MARS', moon:'LUNE' };
const english = () => getLanguage() === 'en';
const ellipsoid = body === 'earth' ? Cesium.Ellipsoid.WGS84 : body === 'mars'
  ? new Cesium.Ellipsoid(3396190, 3396190, 3396190)
  : new Cesium.Ellipsoid(1737400, 1737400, 1737400);
const radius = ellipsoid.maximumRadius;
const geographic = new Cesium.GeographicTilingScheme({ ellipsoid, numberOfLevelZeroTilesX:2, numberOfLevelZeroTilesY:1 });
const moonLocal = Cesium.Rectangle.fromDegrees(23.4484963, .1464532, 23.5396925, 1.1149077);
const marsLocal = Cesium.Rectangle.fromDegrees(77.2229331, 18.3067994, 77.583964, 18.669315);
const tychoLocal = Cesium.Rectangle.fromDegrees(-11.93657107, -44.40436103, -10.82736403, -42.36685531);
const pressed = new Set();

let viewer;
let overviewFraming;
let lastHud = 0;
let orientationAnimation = null;
let movementFrame = 0;
let previousMovementTime = 0;
let terrainUnavailable = false;
let baseImageryReady = false;
let detailedEarthLayer = null;
let earthImageryMode = 'nasa';
let focusSerial = 0;
let google3D;
let googleState = { status:'missing', active:false };
let placeSearch;

document.body.dataset.world = body;
document.title = `${names[body]} · Exploration libre 3D — RELIC`;
$('#world-title').textContent = names[body];
$('#back-link').href = body === 'earth' ? appURL('pages/earth.html').href : appURL(`index.html?body=${body}`).href;
document.querySelector(`.world-nav [data-world="${body}"]`)?.classList.add('active');

function provider(url, level, credit, tilingScheme = geographic, rectangle) {
  return new Cesium.UrlTemplateImageryProvider({
    url, tilingScheme, maximumLevel:level, rectangle,
    credit, enablePickFeatures:false,
  });
}

async function addImagery() {
  const layers = viewer.imageryLayers;
  const local = body === 'earth' ? 'earth-blue-marble-4k.webp'
    : body === 'mars' ? 'mars-viking-global.webp' : 'moon-wac-8k.webp';
  layers.addImageryProvider(await Cesium.SingleTileImageryProvider.fromUrl(
    new URL(`../../assets/${local}`, import.meta.url).href,
    { credit:body === 'earth' ? 'NASA · Blue Marble' : body === 'mars' ? 'NASA · Viking' : 'NASA · LROC WAC' },
  ));
  baseImageryReady = true;
  viewer.scene.requestRender();
}

async function addDetailImagery() {
  const layers = viewer.imageryLayers;
  if (body === 'earth') {
    const mercator = new Cesium.WebMercatorTilingScheme({ ellipsoid });
    layers.addImageryProvider(provider(
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
      8, 'NASA GIBS · Blue Marble', mercator,
    ));
    try {
      detailedEarthLayer = layers.addImageryProvider(await createDetailedEarthImagery(Cesium));
      earthImageryMode = 'detail';
      viewer.scene.requestRender();
    } catch (error) {
      console.warn('Imagerie satellite détaillée indisponible', error);
    }
  } else if (body === 'mars') {
    layers.addImageryProvider(provider(
      'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
      7, 'NASA Mars Trek · Viking MDIM21',
    ));
    layers.addImageryProvider(provider(
      'https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/default/default028mm/{z}/{y}/{x}.png',
      17, 'NASA Mars Trek · MRO HiRISE Jezero', geographic, marsLocal,
    ));
  } else {
    layers.addImageryProvider(provider(
      'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
      8, 'NASA Moon Trek · LROC WAC',
    ));
    layers.addImageryProvider(provider(
      'https://trek.nasa.gov/tiles/Moon/EQ/apollo11_26cm_mosaic_byte_geo_1_2_highContrast/1.0.0/default/default028mm/{z}/{y}/{x}.png',
      15, 'NASA Moon Trek · LROC NAC Apollo 11', geographic, moonLocal,
    ));
    if (backendFeatureAvailable('height:moon') && backendFeatureAvailable('tycho-imagery')) {
      const imagery = new Cesium.UrlTemplateImageryProvider({
        url:appURL('api/imagery/moon/tycho/{z}/{x}/{y}.png').href,
        tilingScheme:geographic, rectangle:tychoLocal,
        minimumLevel:7, maximumLevel:15,
        credit:'NASA LRO · LROC NAC Tycho · orthophoto 2 m',
        enablePickFeatures:false,
      });
      const layer = layers.addImageryProvider(imagery);
      imagery.errorEvent.addEventListener(error => {
        error.retry = false;
        markBackendFeatureUnavailable('tycho-imagery', 60);
        if (!viewer.isDestroyed() && layers.contains(layer)) layers.remove(layer, true);
      });
    }
  }
}

function cartesian(lat, lon, height = 0) {
  return Cesium.Cartesian3.fromDegrees(lon, lat, height, ellipsoid);
}

// Camera frame and ground picking follow the terrain-centered orbit used by
// God's Eye View. The pivot is the point under the viewport center.
function pickTarget(windowPosition) {
  if (!viewer) return null;
  const scene = viewer.scene;
  const canvas = scene.canvas;
  const center = windowPosition || new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
  let target;
  // Use the current ray against loaded ground. A depth-buffer position can
  // still describe the preceding camera frame while a flight is settling.
  if (scene.globe.show) {
    try { target = scene.globe.pick(viewer.camera.getPickRay(center), scene); } catch { /* try depth/ellipsoid below */ }
  }
  if (!Cesium.defined(target) && scene.pickPositionSupported && !scene.globe.show) {
    try { target = scene.pickPosition(center); } catch { /* use ellipsoid below */ }
  }
  if (!Cesium.defined(target)) target = viewer.camera.pickEllipsoid(center, ellipsoid);
  return target && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z) ? target : null;
}

function cameraFrame() {
  const target = pickTarget();
  if (!target) return null;
  const inverse = Cesium.Matrix4.inverseTransformation(
    Cesium.Transforms.eastNorthUpToFixedFrame(target, ellipsoid), new Cesium.Matrix4(),
  );
  const local = Cesium.Matrix4.multiplyByPoint(inverse, viewer.camera.positionWC, new Cesium.Cartesian3());
  const range = Cesium.Cartesian3.magnitude(local);
  if (!Number.isFinite(range) || range < 1) return null;
  const pitch = -Math.asin(Cesium.Math.clamp(local.z / range, -1, 1));
  const heading = pitch < Cesium.Math.toRadians(-88.5)
    ? viewer.camera.heading : Math.atan2(-local.x, -local.y);
  return { target, heading, pitch, range };
}

function setCameraFrame(frame) {
  if (!viewer || !frame?.target || !Number.isFinite(frame.range)) return;
  const camera = viewer.camera;
  camera.lookAt(frame.target, new Cesium.HeadingPitchRange(frame.heading, Math.max(TOP_DOWN_PITCH, frame.pitch), frame.range));
  const destination = Cesium.Cartesian3.clone(camera.positionWC);
  const direction = Cesium.Cartesian3.clone(camera.directionWC);
  const up = Cesium.Cartesian3.clone(camera.upWC);
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  camera.setView({ destination, orientation:{ direction, up } });
  viewer.scene.requestRender();
}

function animateOrientation(changes) {
  overviewFraming?.stop();
  viewer?.camera.cancelFlight();
  const from = cameraFrame();
  if (!from) return;
  orientationAnimation?.cancel?.();
  let cancelled = false;
  orientationAnimation = { cancel:() => { cancelled = true; } };
  const duration = cameraDuration(.42) * 1000;
  if (!duration) { setCameraFrame({ ...from, ...changes }); orientationAnimation = null; return; }
  const start = performance.now();
  const headingDelta = Cesium.Math.negativePiToPi((changes.heading ?? from.heading) - from.heading);
  const next = now => {
    if (cancelled) return;
    const t = Cesium.Math.clamp((now - start) / duration, 0, 1);
    const ease = t * t * (3 - 2 * t);
    setCameraFrame({
      ...from,
      pitch:Cesium.Math.lerp(from.pitch, changes.pitch ?? from.pitch, ease),
      heading:from.heading + headingDelta * ease,
    });
    if (t < 1) requestAnimationFrame(next);
    else orientationAnimation = null;
  };
  requestAnimationFrame(next);
}

function move(direction, amount = 1) {
  overviewFraming?.stop();
  viewer?.camera.cancelFlight();
  const frame = cameraFrame();
  if (!frame) return;
  const geographicPoint = ellipsoid.cartesianToCartographic(frame.target);
  const distance = Cesium.Math.clamp(frame.range * .035, 3, radius * .035) * amount;
  const heading = frame.heading;
  const east = direction === 'up' ? Math.sin(heading) : direction === 'down' ? -Math.sin(heading)
    : direction === 'right' ? Math.cos(heading) : -Math.cos(heading);
  const north = direction === 'up' ? Math.cos(heading) : direction === 'down' ? -Math.cos(heading)
    : direction === 'right' ? -Math.sin(heading) : Math.sin(heading);
  const latitude = Cesium.Math.clamp(geographicPoint.latitude + north * distance / radius, -Math.PI / 2 + .001, Math.PI / 2 - .001);
  const longitude = geographicPoint.longitude + east * distance / (radius * Math.max(.08, Math.cos(latitude)));
  const ground = viewer.scene.globe.getHeight(new Cesium.Cartographic(longitude, latitude)) ?? 0;
  const target = ellipsoid.cartographicToCartesian(new Cesium.Cartographic(longitude, latitude, ground));
  setCameraFrame({ ...frame, target });
  updateHud();
}

function movementLoop(now) {
  movementFrame = 0;
  if (!pressed.size) { previousMovementTime = 0; return; }
  const dt = Math.min(.05, (now - (previousMovementTime || now)) / 1000);
  previousMovementTime = now;
  for (const direction of pressed) move(direction, dt * 7);
  movementFrame = requestAnimationFrame(movementLoop);
}

function startMovement(direction) {
  pressed.add(direction);
  move(direction, .6);
  if (!movementFrame) movementFrame = requestAnimationFrame(movementLoop);
}

function stopMovement(direction) {
  pressed.delete(direction);
}

function resetView(clearSearch = true, duration = .8) {
  if (!viewer) return;
  focusSerial++;
  orientationAnimation?.cancel?.();
  overviewFraming?.show(duration);
  if (clearSearch) { $('#place-input').value = ''; placeSearch?.close(); }
}

async function focus(lat, lon, range = radius * .15, duration = 1.1, label = '') {
  if (!viewer) return;
  overviewFraming?.stop();
  const serial = ++focusSerial;
  orientationAnimation?.cancel?.();
  flyToLocation(viewer, Cesium, { lat, lon, ellipsoid, range, duration,
    current:() => serial === focusSerial && !document.hidden });
  $('#place-input').value = label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

function nearNiceAirport(lat, lon) {
  return lat >= 43.644 && lat <= 43.672 && lon >= 7.200 && lon <= 7.232;
}

function dataForLocation(lat, lon) {
  if (body === 'earth') {
    if (lat < -56 || lat > 60) return {
      terrain:'SRTM HORS COUVERTURE',
      note:'Le relief SRTM de la NASA couvre les terres de 56° S à 60° N. Aucune altitude fine n’est inventée hors de cette zone.',
      elevation:'https://lpdaac.usgs.gov/products/srtmgl1v003/', imagery:earthImageryMode === 'detail' ? ESRI_IMAGERY_URL : 'https://gibs.earthdata.nasa.gov/',
    };
    return {
      terrain:'SRTM · ≈ 30 m',
      note:nearNiceAirport(lat, lon)
        ? 'Pistes de Nice : altitudes des seuils publiées par le SIA, raccordées progressivement au relief NASA SRTM. Les autres surfaces restent mesurées par SRTM.'
        : earthImageryMode === 'detail'
        ? 'Relief NASA SRTM mesuré ; imagerie Esri détaillée. Les pistes revêtues documentées sont lissées avec leurs altitudes publiées.'
        : 'Relief NASA SRTM mesuré ; mosaïque NASA Blue Marble. En zoom proche, les pixels de la mosaïque sont agrandis.',
      elevation:'https://lpdaac.usgs.gov/products/srtmgl1v003/', imagery:earthImageryMode === 'detail' ? ESRI_IMAGERY_URL : 'https://gibs.earthdata.nasa.gov/',
    };
  }
  if (body === 'mars') {
    const dtm = lat >= 18.30529355 && lat <= 18.5483911 && lon >= 77.3833804 && lon <= 77.50109494;
    const local = lat >= 18.3067994 && lat <= 18.669315 && lon >= 77.2229331 && lon <= 77.583964;
    return {
      terrain:dtm ? 'HIRISE DTM · 1 m' : 'MOLA · ≈ 460 m',
      note:dtm
        ? 'Relief stéréo HiRISE mesuré à 1 m et image HiRISE locale. Les trous du modèle reprennent le relief MOLA global.'
        : local
        ? 'Image HiRISE haute résolution ; relief MOLA ≈ 460 m hors du modèle stéréo local.'
        : 'Relief MOLA ≈ 460 m ; mosaïque Viking globale. Les images submétriques de la NASA ne couvrent pas toute la planète.',
      elevation:dtm ? 'https://www.uahirise.org/dtm/ESP_045994_1985' : 'https://pds-geosciences.wustl.edu/missions/mgs/megdr.html',
      imagery:'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars',
    };
  }
  const apollo = lat >= .314609 && lat <= 1.2365388 && lon >= 23.3722758 && lon <= 23.5115296;
  const tycho = lat >= -44.40436103 && lat <= -42.36685531 && lon >= -11.93657107 && lon <= -10.82736403;
  return {
    terrain:apollo || tycho ? 'LROC NAC · 2 m' : 'LOLA · ≈ 475 m',
    note:apollo
      ? 'Autour d’Apollo 11 : relief LROC NAC 2 m et imagerie NAC locale. Hors de cette couverture, le globe reprend LOLA et WAC.'
      : tycho
      ? 'Pic central de Tycho : relief stéréo et orthophoto LROC NAC à 2 m. Les lacunes reprennent le relief LOLA global.'
      : 'Relief LOLA 64 pixels par degré (≈ 475 m à l’équateur) et mosaïque LROC WAC. Un zoom plus proche n’ajoute pas de mesures.',
    elevation:apollo
      ? 'https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/DATA/SDP/NAC_DTM/APOLLO11/'
      : tycho ? 'https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_TYCHOPK'
      : 'https://svs.gsfc.nasa.gov/4720/',
    imagery:tycho ? 'https://data.lroc.im-ldi.com/lroc/view_rdr_product/NAC_DTM_TYCHOPK_MOSAIC_2M'
      : 'https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon',
  };
}

function displayTerrainData(data, lat, lon) {
  if (!english()) return data;
  if (body === 'earth') return {
    ...data,
    terrain:lat < -56 || lat > 60 ? 'SRTM OUTSIDE COVERAGE' : data.terrain,
    note:lat < -56 || lat > 60
      ? 'NASA SRTM relief covers land from 56° S to 60° N. No fine elevation is invented outside this area.'
      : nearNiceAirport(lat, lon)
        ? 'Nice runways: official SIA threshold elevations blended into NASA SRTM terrain. The surrounding surface remains SRTM.'
        : earthImageryMode === 'detail'
        ? 'Measured NASA SRTM terrain; detailed Esri imagery. Documented paved runways use published endpoint elevations.'
        : 'Measured NASA SRTM terrain; NASA Blue Marble mosaic. Close zoom enlarges the mosaic pixels.',
  };
  if (body === 'mars') {
    const dtm = lat >= 18.30529355 && lat <= 18.5483911 && lon >= 77.3833804 && lon <= 77.50109494;
    const local = lat >= 18.3067994 && lat <= 18.669315 && lon >= 77.2229331 && lon <= 77.583964;
    return { ...data, note:dtm
      ? 'Measured HiRISE stereo terrain at 1 m and local HiRISE imagery. Gaps use global MOLA relief.'
      : local ? 'High resolution HiRISE imagery; MOLA relief about 460 m outside the local stereo terrain.'
      : 'MOLA relief about 460 m; global Viking mosaic. NASA submeter imagery does not cover the entire planet.' };
  }
  const apollo = lat >= .314609 && lat <= 1.2365388 && lon >= 23.3722758 && lon <= 23.5115296;
  const tycho = lat >= -44.40436103 && lat <= -42.36685531 && lon >= -11.93657107 && lon <= -10.82736403;
  return { ...data, note:apollo
    ? 'Around Apollo 11: LROC NAC relief at 2 m and local NAC imagery. Outside this footprint, the globe uses LOLA and WAC.'
    : tycho ? 'Tycho central peak: LROC NAC stereo relief and orthophoto at 2 m. Gaps use global LOLA relief.'
    : 'LOLA relief at 64 pixels per degree (about 475 m at the equator) and LROC WAC mosaic. Closer zoom adds no measured detail.' };
}

function showGoogleState(state) {
  googleState = state;
  const en = english();
  $('#terrain-google3d-toggle').setAttribute('aria-pressed', String(state.active));
  $('#terrain-google3d-status').textContent = state.status === 'ready'
    ? (en ? 'Active' : 'Actif')
    : state.status === 'loading' ? (en ? 'Loading…' : 'Chargement…')
      : state.status === 'error' ? (en ? 'Google 3D unavailable' : 'Google 3D indisponible')
        : state.status === 'off' ? (en ? 'NASA terrain' : 'Relief NASA')
          : (en ? 'Google 3D unavailable' : 'Google 3D indisponible');
  document.body.dataset.google3d = String(state.active);
  $('#height-button').disabled = state.active;
  updateHud(true);
}

async function goToSite(site) {
  viewer.scene.verticalExaggeration = ['jezero', 'apollo11', 'tycho'].includes(site.id) ? 1 : 2;
  $('#height-button span').textContent = `Relief × ${viewer.scene.verticalExaggeration}`;
  $('#site-title').textContent = site.name;
  history.replaceState({}, '', appURL(`pages/terrain.html?body=${body}&site=${encodeURIComponent(site.id)}`).href);
  await focus(site.lat, site.lon, await initialRange(site), 1.1, site.name);
}

function updateHud(force = false) {
  if (!viewer || (!force && performance.now() - lastHud < 190)) return;
  lastHud = performance.now();
  const target = pickTarget();
  if (!target) return;
  const point = ellipsoid.cartesianToCartographic(target);
  const lat = Cesium.Math.toDegrees(point.latitude);
  const lon = Cesium.Math.toDegrees(point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  $('#coordinates-value').textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  const altitude = Math.max(0, viewer.camera.positionCartographic.height);
  $('#altitude-value').textContent = altitude < 1000 ? `${Math.round(altitude)} m` : `${(altitude / 1000).toLocaleString('fr-FR', { maximumFractionDigits:1 })} km`;
  const data = displayTerrainData(dataForLocation(lat, lon), lat, lon);
  $('#terrain-value').textContent = googleState.active ? 'Google 3D'
    : terrainUnavailable ? (english() ? 'Unavailable' : 'Indisponible') : data.terrain;
  $('#data-note').textContent = googleState.active
    ? (english() ? 'Google photorealistic 3D tiles via Cesium ion. NASA elevation remains available when Google 3D is switched off.' : 'Tuiles 3D photoréalistes Google via Cesium ion. Le relief NASA reste disponible en désactivant Google 3D.')
    : terrainUnavailable
    ? (english() ? 'The elevation server is unavailable. The displayed surface is temporarily flat.' : 'Le serveur de relief ne répond pas. La surface affichée est provisoirement plate.')
    : data.note;
  $('#elevation-source').href = data.elevation;
  $('#imagery-source').href = data.imagery;
  $('#imagery-source').textContent = googleState.active
    ? (english() ? 'Google 3D' : 'Google 3D')
    : body === 'earth' && earthImageryMode === 'detail'
    ? (english() ? 'Esri imagery' : 'Imagerie Esri')
    : (english() ? 'NASA imagery' : 'Imagerie NASA');
  $('#runway-source').hidden = body !== 'earth' || !nearNiceAirport(lat, lon);
  $('#runway-source').textContent = english() ? 'RUNWAYS · FRENCH AIP' : 'PISTES · AIP';
  $('#runways-source').hidden = body !== 'earth';
  $('#runways-source').textContent = english() ? 'RUNWAYS · OURAIRPORTS' : 'PISTES · OURAIRPORTS';
  if (googleState.active) $('#imagery-source').href = 'https://cesium.com/platform/cesium-ion/content/google-photorealistic-3d-tiles/';
  $('#scene-credit').textContent = googleState.active ? 'GOOGLE PHOTOREALISTIC 3D TILES · CESIUM ION' : body === 'earth'
    ? earthImageryMode === 'detail' ? 'IMAGERIE ESRI · RELIEF NASA SRTM' : 'NASA GIBS · NASA SRTM'
    : body === 'mars' ? data.terrain.startsWith('HIRISE') ? 'NASA MRO HIRISE · RELIEF STÉRÉO' : 'NASA MARS TREK · MGS MOLA'
      : data.terrain.startsWith('LROC') ? 'NASA LROC NAC · RELIEF STÉRÉO' : 'NASA MOON TREK · LRO LOLA';
  $('#esri-attribution').hidden = googleState.active || body !== 'earth' || earthImageryMode !== 'detail';
}

function setUpControls() {
  $('#tilt-button').addEventListener('click', () => {
    const frame = cameraFrame();
    if (!frame) return;
    const topDown = frame.pitch < Cesium.Math.toRadians(-65);
    animateOrientation({ pitch:Cesium.Math.toRadians(topDown ? -38 : -88) });
    $('#tilt-button span').textContent = topDown ? (english() ? 'Top view' : 'Vue du dessus') : (english() ? 'Tilt' : 'Incliner');
  });
  $('#north-button').addEventListener('click', () => animateOrientation({ heading:0 }));
  $('#height-button').addEventListener('click', () => {
    overviewFraming?.stop();
    viewer.scene.verticalExaggeration = viewer.scene.verticalExaggeration === 1 ? 2 : 1;
    $('#height-button span').textContent = `Relief × ${viewer.scene.verticalExaggeration}`;
    viewer.scene.requestRender();
  });
  if (body === 'earth') $('#terrain-google3d-toggle').addEventListener('click', async () => {
    overviewFraming?.stop();
    if (!google3D) return;
    if (google3D.active) { google3D.disable(); return; }
    await google3D.enable();
  });
  $('#reset-button').addEventListener('click', () => resetView());
  const keys = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' };
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.target instanceof HTMLElement && event.target.closest('input,textarea,select,button,dialog,[role=dialog],[role=listbox],[role=option]')) return;
    const direction = keys[event.key];
    if (!direction) return;
    event.preventDefault();
    if (!pressed.has(direction)) startMovement(direction);
  });
  window.addEventListener('keyup', event => { if (keys[event.key]) stopMovement(keys[event.key]); });
  window.addEventListener('blur', () => pressed.clear());
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction(event => {
    const hit = pickTarget(event.position);
    if (!hit) return;
    const point = ellipsoid.cartesianToCartographic(hit);
    const frame = cameraFrame();
    const range = Math.min(frame?.range || radius * .2, radius * .15);
    focus(Cesium.Math.toDegrees(point.latitude), Cesium.Math.toDegrees(point.longitude), range, .85);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction(event => {
    const hit = pickTarget(event.position);
    if (!hit) return;
    const point = ellipsoid.cartesianToCartographic(hit);
    focus(Cesium.Math.toDegrees(point.latitude), Cesium.Math.toDegrees(point.longitude), Math.max(50, (cameraFrame()?.range || radius * .2) * .35), .7);
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  viewer.camera.changed.addEventListener(() => updateHud());
}

function initialLocation() {
  const lat = Number(query.get('lat'));
  const lon = Number(query.get('lon'));
  if (query.has('lat') && query.has('lon') && Number.isFinite(lat) && Number.isFinite(lon)
    && lat>=-90&&lat<=90&&lon>=-180&&lon<=180){const range=Number(query.get('range'));return {lat,lon,...(Number.isFinite(range)&&range>=100&&range<=55000000?{range}:{})};}
  const site = query.get('site');
  const item = (body === 'earth' ? EARTH_SITES : PLANET_SITES[body]).find(candidate => candidate.id === site);
  return item || null;
}

async function start() {
  try {
    const terrainProvider = createMeasuredTerrain(body, ellipsoid, available => {
      terrainUnavailable = !available;
      updateHud(true);
    });
    viewer = new Cesium.Viewer($('#terrain-scene'), {
      ellipsoid, mapProjection:new Cesium.GeographicProjection(ellipsoid),
      globe:new Cesium.Globe(ellipsoid), terrainProvider, baseLayer:false,
      timeline:false, animation:false, baseLayerPicker:false, geocoder:false,
      homeButton:false, sceneModePicker:false, navigationHelpButton:false,
      fullscreenButton:false, vrButton:false, selectionIndicator:false,
      infoBox:false, creditContainer:$('#cesium-credits'),
      showRenderLoopErrors:false,
      msaaSamples:1,
    });
    viewer.clock.shouldAnimate = false;
    viewer.scene.verticalExaggeration = 2;
    viewer.scene.highDynamicRange = false;
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false;
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false;
    if (viewer.scene.sun) viewer.scene.sun.show = false;
    if (viewer.scene.moon) viewer.scene.moon.show = false;
    viewer.scene.backgroundColor = Cesium.Color.BLACK;
    viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString(body === 'mars' ? '#80503c' : body === 'moon' ? '#686765' : '#102436');
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 8;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = radius * 6;
    viewer.scene.screenSpaceCameraController.inertiaSpin = .75;
    viewer.scene.screenSpaceCameraController.inertiaTranslate = .72;
    viewer.scene.screenSpaceCameraController.inertiaZoom = .72;
    initializeProviderCredits({elements:[$('#scene-credit'), $('#esri-attribution'), $('#cesium-credits')]});
    configureWorldPerformance(viewer, {
      loading:viewLoading,
      isReady:() => baseImageryReady && viewer.scene.globe.tilesLoaded,
      onReady:() => {
        addDetailImagery().catch(() => { /* The packaged NASA base remains visible. */ });
        google3D?.enable();
      },
      onSuspend:() => {
      focusSerial++;
      pressed.clear();
      cancelAnimationFrame(movementFrame);
      movementFrame = 0;
      previousMovementTime = 0;
      orientationAnimation?.cancel?.();
      viewer.camera.cancelFlight();
    } });
    viewer.scene.canvas.addEventListener('pointerdown', () => { focusSerial++; }, { passive:true });
    viewer.scene.canvas.addEventListener('wheel', () => { focusSerial++; }, { passive:true });
    viewer.scene.postRender.addEventListener(function ready() {
      updateHud(true);
      viewer.scene.postRender.removeEventListener(ready);
    });
    addImagery().catch(() => { viewLoading.fail(); });
    if (body === 'earth') {
      $('#terrain-google3d').hidden = false;
      google3D = createGoogle3D(viewer, showGoogleState);
    }
    overviewFraming = createOverviewFraming(viewer, Cesium, { ellipsoid, latitude:18, longitude:0 });
    const startPoint = initialLocation();
    if (['jezero', 'apollo11', 'tycho'].includes(startPoint?.id)) viewer.scene.verticalExaggeration = 1;
    $('#height-button span').textContent = `Relief × ${viewer.scene.verticalExaggeration}`;
    setUpControls();
    if (startPoint) {
      if (startPoint.id) {
        $('#site-title').textContent = startPoint.name;
      }
      const range = Number.isFinite(startPoint.terrainRange) ? startPoint.terrainRange
        : Number.isFinite(startPoint.range) ? startPoint.range : Math.max(1200, radius * .045);
      focus(startPoint.lat, startPoint.lon, range, 0, startPoint.name);
    }
    else resetView(false, 0);
    viewer.scene.requestRender();
  } catch (error) {
    console.warn('The planetary graphics view could not start.');
    viewLoading.fail();
  }
}

placeSearch = createPlaceSearch({
  world:body,
  places:() => body === 'earth' ? EARTH_SITES : PLANET_SITES[body],
  language:getLanguage,
  getBias:() => {
    if (!viewer || viewer.camera.positionCartographic.height > 2_000_000) return null;
    const target = pickTarget();
    if (!target) return null;
    const point = ellipsoid.cartesianToCartographic(target);
    return { lat:Cesium.Math.toDegrees(point.latitude), lon:Cesium.Math.toDegrees(point.longitude) };
  },
  onSelect:async place => {
    if (place.source === 'nasa') return goToSite(place.site);
    if (body === 'earth') {
      viewer.scene.verticalExaggeration = 1;
      $('#height-button span').textContent = 'Relief × 1';
    }
    $('#site-title').textContent = place.name;
    history.replaceState({}, '', appURL(`pages/terrain.html?body=${body}&lat=${place.lat}&lon=${place.lon}`).href);
    await focus(place.lat, place.lon, place.range || 2500, 1.1,
      place.detail ? `${place.name}, ${place.detail}` : place.name);
  },
});
start();
startLiveData($('#terrain-live-data'), () => body);
onLanguageChange(lang => {
  viewLoading.refresh();
  const en = lang === 'en';
  document.title = `${en ? { earth:'Earth', mars:'Mars', moon:'Moon' }[body] : names[body]} · ${en ? '3D terrain' : 'Exploration libre 3D'} — RELIC`;
  $('.back-link span:last-child').textContent = 'RELIC';
  $('#world-title').textContent = en ? { earth:'Earth', mars:'Mars', moon:'Moon' }[body] : { earth:'Terre', mars:'Mars', moon:'Lune' }[body];
  $('.world-nav [data-world="earth"]').textContent = en ? 'Earth' : 'Terre';
  $('.world-nav [data-world="mars"]').textContent = 'Mars';
  $('.world-nav [data-world="moon"]').textContent = en ? 'Moon' : 'Lune';
  $('.eyebrow').firstChild.textContent = en ? 'Explore ' : 'Explorer ';
  if (['Données', 'Data'].includes($('#site-title').textContent)) $('#site-title').textContent = en ? 'Data' : 'Données';
  placeSearch.setLanguage();
  const labels = $('.site-facts').querySelectorAll('dt');
  [en ? 'Position' : 'Position', en ? 'Altitude' : 'Altitude', en ? 'Terrain' : 'Relief'].forEach((value, i) => { labels[i].textContent = value; });
  $('#elevation-source').textContent = en ? 'NASA elevation' : 'Relief NASA';
  $('#imagery-source').textContent = body === 'earth' && earthImageryMode === 'detail'
    ? en ? 'Esri imagery' : 'Imagerie Esri'
    : en ? 'NASA imagery' : 'Imagerie NASA';
  $('#nav-hint').innerHTML = en
    ? 'DRAG: MOVE <span>·</span> PINCH / SCROLL: ZOOM <span>·</span> TAP: AIM <span>·</span> ARROWS: MOVE'
    : 'GLISSER : SE DÉPLACER <span>·</span> PINCER / MOLETTE : ZOOMER <span>·</span> TOUCHER : VISER <span>·</span> FLÈCHES : AVANCER';
  $('#tilt-button span').textContent = en ? 'Tilt' : 'Incliner';
  $('#north-button span').textContent = en ? 'North' : 'Nord';
  $('#reset-button span').textContent = en ? 'Overview' : 'Vue globale';
  if (body === 'earth') {
    ($('#terrain-google3d-toggle .world-button-label') || $('#terrain-google3d-toggle')).textContent = 'Google 3D';
    showGoogleState(googleState);
  }
  updateHud(true);
});
