const $ = selector => document.querySelector(selector);
const host = $('#scene');
const LABELS = {
  habitat: 'Habitat', greenhouse: 'Serre', science: 'Laboratoire',
  airlock: 'Sas', solar: 'Énergie', rover: 'Rover',
  comms: 'Communications', landing: 'Atterrissage', overview: 'Vue globale'
};
const DESCRIPTIONS = {
  habitat: 'Module pressurisé, couche de protection contre le rayonnement, couchettes, consoles et recyclage de l’air.',
  greenhouse: 'Culture hydroponique sous éclairage contrôlé. Les cultures ne remplacent pas le système de survie.',
  science: 'Analyse des échantillons, paillasses, stockage étanche et instrumentation.',
  airlock: 'Deux portes interverrouillées, dépressurisation et repressurisation séquencées.',
  solar: 'Réseau déployable. La puissance dépend de l’éclairement et de l’état des panneaux.',
  rover: 'Véhicule électrique autonome avec batterie et parcours hors de l’aire d’atterrissage.',
  comms: 'Liaison radio directionnelle et infrastructure de communications locale.',
  landing: 'Aire stabilisée à distance des habitats, avec merlon de protection.'
};
const INTERIORS = new Set(['habitat', 'greenhouse', 'science', 'airlock']);
const VISIBLE_MARKERS = ['habitat', 'greenhouse', 'science', 'airlock', 'solar', 'rover', 'comms', 'landing'];

let THREE, renderer, camera, controls, scene, architecture, environment, simulation;
let selected = 'overview', interior = false, paused = false, cameraTween = null;
let lastFrame = 0, lastUi = 0, latestSnapshot, lastEventId = 0;
let activeScenario = 'none';
let markerButtons = new Map(), downPosition = null, toastTimeout;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

function toast(message) {
  if (!message) return;
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { node.hidden = true; }, 3600);
}
function command(name, payload) {
  const result = simulation.command(name, payload);
  if (result?.message) toast(result.message);
  latestSnapshot = simulation.snapshot();
  renderUI(latestSnapshot);
  return result;
}
function point(pointLike) {
  return new THREE.Vector3(...(pointLike || [0, 0, 0]));
}
function presetFor(key, showInterior = false) {
  if (showInterior && architecture.interiorFocusPoints?.[key]) return architecture.interiorFocusPoints[key];
  return architecture.focusPoints[key] || architecture.focusPoints.overview;
}
function focus(key, showInterior = false) {
  if (!architecture.focusPoints[key]) key = 'overview';
  const targetInterior = showInterior && (INTERIORS.has(key) || key === 'overview');
  selected = key;
  interior = targetInterior;
  architecture.setInteriorMode(targetInterior ? (key === 'overview' ? 'all' : key) : false);
  const preset = presetFor(key, targetInterior);
  cameraTween = {
    fromEye: camera.position.clone(), fromTarget: controls.target.clone(),
    toEye: point(preset.eye), toTarget: point(preset.point),
    began: performance.now(), duration: reducedMotion ? 1 : 900
  };
  document.body.classList.toggle('focused', key !== 'overview');
  $('#panel-title').textContent = targetInterior ? (LABELS[key] + ' · intérieur') : (LABELS[key] || preset.title || 'Vue globale');
  $('#module-detail').querySelector('span').textContent = key === 'overview' ? 'BASE' : LABELS[key].toUpperCase();
  $('#module-detail').querySelector('p').textContent = key === 'overview'
    ? 'Choisissez un module pour en voir la structure et les équipements.'
    : DESCRIPTIONS[key] || 'Module de la base lunaire.';
  $('#locations').querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.focus === key));
  $('#interior-button').hidden = key !== 'overview' && !INTERIORS.has(key);
  $('#interior-button').setAttribute('aria-pressed', String(targetInterior));
  $('#interior-state').textContent = targetInterior ? 'DÉSACTIVER ↗' : 'ACTIVER ↗';
  if (innerWidth <= 780 && key !== 'overview') collapsePanel(true);
  updateMarkers();
}
function collapsePanel(collapsed) {
  $('.console').classList.toggle('collapsed', collapsed);
  $('#panel-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#panel-toggle').setAttribute('aria-label', collapsed ? 'Déployer le panneau' : 'Réduire le panneau');
}
function tab(name) {
  const explore = name === 'explore';
  $('#tab-explore').setAttribute('aria-selected', String(explore));
  $('#tab-systems').setAttribute('aria-selected', String(!explore));
  $('#explore-panel').hidden = !explore;
  $('#systems-panel').hidden = explore;
}
function createNavigation() {
  const order = ['habitat', 'greenhouse', 'science', 'airlock', 'solar', 'rover', 'comms', 'landing'];
  const container = $('#locations');
  container.replaceChildren();
  const markerLayer = $('#marker-layer');
  markerLayer.replaceChildren();
  order.filter(key => architecture.focusPoints[key]).forEach((key, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.focus = key;
    button.innerHTML = '<span class="location-index"></span><span></span><span aria-hidden="true">↗</span>';
    button.children[0].textContent = String(index + 1).padStart(2, '0');
    button.children[1].textContent = LABELS[key];
    button.addEventListener('click', () => focus(key));
    container.appendChild(button);
    if (!VISIBLE_MARKERS.includes(key)) return;
    const marker = document.createElement('button');
    marker.type = 'button'; marker.className = 'marker'; marker.textContent = LABELS[key];
    marker.setAttribute('aria-label', 'Inspecter ' + LABELS[key].toLowerCase());
    marker.addEventListener('click', () => focus(key));
    markerLayer.appendChild(marker);
    markerButtons.set(key, marker);
  });
}
function updateMarkers() {
  const visible = selected === 'overview' && !interior && innerWidth > 780;
  const viewport = new THREE.Vector3();
  for (const [key, button] of markerButtons) {
    const preset = architecture.focusPoints[key];
    viewport.copy(point(preset.point)).add(new THREE.Vector3(0, key === 'comms' ? 3 : 2.7, 0)).project(camera);
    const x = (viewport.x + 1) * innerWidth / 2;
    const y = (1 - viewport.y) * innerHeight / 2;
    const onScreen = viewport.z > 0 && viewport.z < 1 && x > 20 && x < innerWidth - 355 && y > 90 && y < innerHeight - 100;
    button.hidden = !visible || !onScreen;
    if (!button.hidden) { button.style.left = x + 'px'; button.style.top = y + 'px'; }
  }
}
function format(value, unit = '', digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits).replace('.', ',') + unit : '—';
}
function airlockLabel(phase) {
  return ({
    sealed: 'VERROUILLÉ',
    innerOpening: 'OUVERTURE INT.',
    innerOpen: 'PORTE INT. OUVERTE',
    innerClosing: 'FERMETURE INT.',
    depressurizing: 'DÉPRESSURISATION',
    outerOpening: 'OUVERTURE EXT.',
    outerOpen: 'PORTE EXT. OUVERTE',
    outerClosing: 'FERMETURE EXT.',
    pressurizing: 'PRESSURISATION'
  })[phase] || phase?.toUpperCase() || '—';
}
function renderUI(state) {
  const power = state.power || {}, life = state.lifeSupport || {}, lock = state.airlock || {}, rover = state.rover || {};
  const battery = power.batteryPercent ?? 0, oxygen = life.oxygenPercent ?? 0;
  $('#power-value').textContent = format(battery, ' %', 1);
  $('#oxygen-value').textContent = format(oxygen, ' %', 1);
  $('#power-bar').style.width = Math.max(0, Math.min(100, battery)) + '%';
  $('#oxygen-bar').style.width = Math.max(0, Math.min(100, oxygen)) + '%';
  $('#power-bar').style.background = battery < 18 ? '#f0a589' : '#abd9c6';
  $('#oxygen-bar').style.background = oxygen < 18 ? '#f0a589' : '#abd9c6';
  $('#pressure-value').textContent = format(life.pressureKPa, ' kPa', 1);
  $('#temperature-value').textContent = format(life.temperatureC, ' °C', 1);
  $('#production-value').textContent = format(power.generationKw, ' kW', 1);
  $('#load-value').textContent = format(power.demandKw, ' kW', 1);
  $('#co2-value').textContent = format(life.co2Ppm, ' ppm');
  $('#water-value').textContent = format(life.waterKg, ' kg');
  $('#chamber-value').textContent = format(lock.chamberPressureKPa, ' kPa', 1);
  $('#sunlight-value').textContent = format((state.lighting?.solarVisibility ?? 0) * 100, ' %');
  $('#gas-value').textContent = format(life.gasReserveKg, ' kg', 1);
  $('#gravity-value').textContent = format(state.lunarGravityMps2, ' m/s²', 2);
  $('.status').classList.toggle('warning', state.status?.level === 'warning');
  $('.status').classList.toggle('critical', state.status?.level === 'critical');
  $('#status-label').textContent = state.status?.label || 'Simulation active';
  $('#airlock-state').textContent = airlockLabel(lock.phase);
  $('#airlock-button').dataset.alert = String(lock.phase !== 'sealed' && lock.phase !== 'outerOpen');
  $('#rover-state').textContent = ({
    docked: 'À QUAI', driving: 'EN ROUTE', returning: 'RETOUR', stopped: 'À L’ARRÊT'
  })[rover.mode] || '—';
  $('#rover-return-button').disabled = rover.mode === 'docked' || rover.mode === 'returning';
  $('#solar-state').textContent = power.solarEnabled ? 'DÉPLOYÉS' : 'REPLIÉS';
  $('#greenhouse-state').textContent = state.modules?.greenhouse?.enabled ? 'ACTIVE' : 'VEILLE';
  $('#isru-state').textContent = state.modules?.isru?.enabled ? 'ACTIVE' : 'VEILLE';
  const lightMode = state.lighting?.mode || 'auto';
  const nextLight = lightMode === 'day' ? 'Nuit' : lightMode === 'night' ? 'Auto' : 'Jour';
  $('#sun-button').setAttribute('aria-pressed', String(lightMode === 'night'));
  $('#sun-icon').textContent = lightMode === 'night' ? '☾' : '☼';
  $('#sun-label').textContent = nextLight;
  const events = (state.events || []).slice(-4).reverse();
  const list = $('#event-list'); list.replaceChildren();
  for (const event of events) {
    const item = document.createElement('li');
    item.textContent = event.message;
    if (event.level === 'warning' || event.level === 'critical') item.style.borderLeftColor = '#f0ac83';
    list.appendChild(item);
  }
  const newest = state.events?.at(-1);
  if (newest && newest.id > lastEventId) {
    lastEventId = newest.id;
    if (newest.level === 'critical' || newest.level === 'warning') toast(newest.message);
  }
}
function installUI() {
  createNavigation();
  $('#tab-explore').addEventListener('click', () => tab('explore'));
  $('#tab-systems').addEventListener('click', () => tab('systems'));
  $('#panel-toggle').addEventListener('click', () => collapsePanel(!$('.console').classList.contains('collapsed')));
  $('#overview-button').addEventListener('click', () => focus('overview'));
  $('#interior-button').addEventListener('click', () => focus(selected, !interior));
  $('#sun-button').addEventListener('click', () => {
    const current = latestSnapshot?.lighting?.mode;
    const next = current === 'day' ? 'night' : current === 'night' ? 'auto' : 'day';
    command('setLighting', next === 'day' ? { mode: 'day', elevationDeg: 4.5 } : next);
  });
  $('#pause-button').addEventListener('click', () => {
    paused = !paused;
    $('#pause-button').setAttribute('aria-pressed', String(paused));
    $('#pause-icon').textContent = paused ? '▶' : 'Ⅱ';
    $('#pause-label').textContent = paused ? 'Reprendre' : 'Pause';
  });
  $('#speed-select').addEventListener('change', event => command('setTimeScale', Number(event.target.value)));
  $('#airlock-button').addEventListener('click', () => { command('airlockCycle'); tab('systems'); focus('airlock'); tab('systems'); });
  $('#rover-button').addEventListener('click', () => { command('toggleRover'); focus('rover'); tab('systems'); });
  $('#rover-return-button').addEventListener('click', () => { command('returnRover'); focus('rover'); tab('systems'); });
  $('#solar-button').addEventListener('click', () => { command('toggleSolar'); focus('solar'); tab('systems'); });
  $('#greenhouse-button').addEventListener('click', () => {
    command('setModule', { name: 'greenhouse', enabled: !latestSnapshot.modules.greenhouse.enabled });
    focus('greenhouse'); tab('systems');
  });
  $('#isru-button').addEventListener('click', () =>
    command('setModule', { name: 'isru', enabled: !latestSnapshot.modules.isru.enabled }));
  $('#scenario-select').addEventListener('change', event => {
    const next = event.target.value;
    if (activeScenario !== 'none') command('clearFailure', activeScenario);
    activeScenario = next;
    if (next !== 'none') command('setFailure', next);
  });
  if (innerWidth <= 780) collapsePanel(true);
  renderer.domElement.addEventListener('pointerdown', event => { downPosition = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!downPosition || Math.hypot(event.clientX - downPosition[0], event.clientY - downPosition[1]) > 5) { downPosition = null; return; }
    downPosition = null;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      -((event.clientY - rect.top) / rect.height * 2 - 1));
    const ray = new THREE.Raycaster(); ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(architecture.pickables, false)[0];
    if (hit?.object?.userData?.focus) focus(hit.object.userData.focus);
  });
  controls.addEventListener('start', () => { cameraTween = null; });
  addEventListener('keydown', event => {
    if (event.target.closest('button,select,input,textarea')) return;
    if (event.key === 'Escape') focus('overview');
    if (event.key.toLowerCase() === 'i') focus(selected, !interior);
    if (event.code === 'Space') { event.preventDefault(); $('#pause-button').click(); }
  });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth <= 780 ? 1.25 : 1.65));
    updateMarkers();
  });
}
function animate(time) {
  requestAnimationFrame(animate);
  const dt = Math.min((time - (lastFrame || time)) / 1000, .08);
  lastFrame = time;
  if (!paused) latestSnapshot = simulation.update(dt);
  const state = latestSnapshot;
  environment.update({
    sunElevation: state.lighting.sunElevationDeg,
    sunAzimuth: state.lighting.sunAzimuthDeg,
    dt
  });
  architecture.update(dt, time, {
    airlockPhase: state.airlock.phase,
    solar: state.power.solarEnabled,
    solarDust: state.faults?.solarDust,
    powered: state.power.loads?.habitat?.powered && state.power.loads?.lifeSupport?.powered,
    rover: state.rover.active,
    roverPosition: state.rover.position,
    roverHeadingRad: state.rover.headingRad,
    night: !state.lighting.isSunlit,
    interiorMode: interior ? (selected === 'overview' ? 'all' : selected) : false,
    sunAngle: -.25 - (state.lighting.sunElevationDeg * Math.PI / 180) * .4
  });
  if (cameraTween) {
    const t = Math.min((time - cameraTween.began) / cameraTween.duration, 1);
    const eased = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(cameraTween.fromEye, cameraTween.toEye, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
    if (t >= 1) cameraTween = null;
  }
  controls.update();
  renderer.render(scene, camera);
  if (time - lastUi > 450) { lastUi = time; renderUI(state); }
  updateMarkers();
}
async function boot() {
  try {
    const [three, orbit, architectureModule, environmentModule, physicsModule] = await Promise.all([
      import('three'), import('three/addons/controls/OrbitControls.js'),
      import('./lunar-architecture.js'), import('./lunar-environment.js'), import('./lunar-physics.js')
    ]);
    THREE = three;
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth <= 780 ? 1.25 : 1.65));
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.52;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(renderer.domElement);
    camera = new THREE.PerspectiveCamera(53, innerWidth / innerHeight, .035, 650);
    environment = environmentModule.buildLunarEnvironment(scene, THREE, {
      quality: innerWidth <= 780 ? 'low' : 'high'
    });
    architecture = architectureModule.buildArchitecture(scene, THREE);
    const start = architecture.focusPoints.overview;
    camera.position.set(...start.eye);
    controls = new orbit.OrbitControls(camera, renderer.domElement);
    controls.target.set(...start.point);
    controls.enableDamping = true;
    controls.dampingFactor = .075;
    controls.minDistance = .7;
    controls.maxDistance = 175;
    controls.maxPolarAngle = Math.PI / 2 - .01;
    controls.update();
    simulation = new physicsModule.LunarBaseSimulation();
    simulation.command('setTimeScale', Number($('#speed-select').value));
    simulation.command('setLighting', { mode: 'day', elevationDeg: 4.5 });
    latestSnapshot = simulation.snapshot();
    installUI();
    renderUI(latestSnapshot);
    $('#loading').hidden = true;
    requestAnimationFrame(animate);
  } catch (error) {
    console.error('Lunar base failed to start', error);
    $('#loading').hidden = true;
    $('#error').hidden = false;
    $('#error').textContent = 'La scène 3D ne peut pas démarrer : ' + (error?.message || 'erreur inconnue');
  }
}
boot();
