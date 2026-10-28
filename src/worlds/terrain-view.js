import { appURL } from '../core/paths.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EARTH_SITES, PLANET_SITES } from '../atlas/nasa-worlds.js';

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const body = ['earth', 'mars', 'moon'].includes(params.get('body')) ? params.get('body') : 'earth';
const sites = body === 'earth' ? EARTH_SITES : PLANET_SITES[body];
const names = { earth:'TERRE', mars:'MARS', moon:'LUNE' };
const palette = {
  earth:{ background:0x08141e, fog:0x0d2030, light:0xe2f4ff },
  mars:{ background:0x120f12, fog:0x301a18, light:0xffdbc6 },
  moon:{ background:0x080d17, fog:0x19202b, light:0xe8efff },
};

let renderer, camera, scene, controls, terrain, edges, baseElevation, current, catalog;
let exaggeration = 2;
let activeSite;
let frameQueued = false;
let animation = null;
let gestureActive = false;
let lastFrame = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const textureLoader = new THREE.TextureLoader();
const siteCache = new Map();
const pressed = new Set();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

$('#world-title').textContent = names[body];
$('#back-link').href = body === 'earth' ? appURL('pages/earth.html').href : appURL(`index.html?body=${body}`).href;
document.querySelector(`[data-world="${body}"]`)?.classList.add('active');
document.body.dataset.world = body;

function invalidate() {
  if (!frameQueued) {
    frameQueued = true;
    requestAnimationFrame(render);
  }
}

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias:window.devicePixelRatio < 2, powerPreference:'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  $('#terrain-scene').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(palette[body].background);
  scene.fog = new THREE.FogExp2(palette[body].fog, .0008);
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, .001, 10000);
  camera.position.set(0, 20, 20);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = .08;
  controls.zoomSpeed = 1.15;
  controls.panSpeed = 1.1;
  controls.rotateSpeed = .68;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = false;
  controls.minPolarAngle = .06;
  controls.maxPolarAngle = Math.PI / 2 - .012;
  controls.mouseButtons = { LEFT:THREE.MOUSE.ROTATE, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.PAN };
  controls.touches = { ONE:THREE.TOUCH.ROTATE, TWO:THREE.TOUCH.DOLLY_PAN };
  controls.addEventListener('start', () => { gestureActive = true; animation = null; invalidate(); });
  controls.addEventListener('end', () => { gestureActive = false; invalidate(); });
  controls.addEventListener('change', invalidate);
  scene.add(new THREE.AmbientLight(0xb9d9ed, .82));
  const sun = new THREE.DirectionalLight(palette[body].light, 2.2);
  sun.position.set(-1, 2.4, 1.3);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x22313e, .6));
  renderer.domElement.addEventListener('dblclick', focusAtPointer);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.5 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    invalidate();
  });
}

function heightAt(x, z) {
  if (!baseElevation || !current) return 0;
  const n = catalog.grid;
  const w = current.widthKm;
  const fx = THREE.MathUtils.clamp((x / w + .5) * (n - 1), 0, n - 1.00001);
  const fz = THREE.MathUtils.clamp((z / w + .5) * (n - 1), 0, n - 1.00001);
  const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const a = baseElevation[z0 * n + x0], b = baseElevation[z0 * n + x0 + 1];
  const c = baseElevation[(z0 + 1) * n + x0], d = baseElevation[(z0 + 1) * n + x0 + 1];
  return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) * exaggeration;
}

function clampTarget() {
  if (!current) return;
  const limit = current.widthKm * .48;
  const x = THREE.MathUtils.clamp(controls.target.x, -limit, limit);
  const z = THREE.MathUtils.clamp(controls.target.z, -limit, limit);
  if (x !== controls.target.x || z !== controls.target.z) {
    camera.position.x += x - controls.target.x;
    camera.position.z += z - controls.target.z;
    controls.target.x = x;
    controls.target.z = z;
  }
  // Keep navigation tied to the observed terrain, as in God's Eye View.
  const elevation = heightAt(x, z);
  if (Math.abs(elevation - controls.target.y) > .0001) {
    camera.position.y += elevation - controls.target.y;
    controls.target.y = elevation;
  }
}

function move(direction, amount = 1) {
  if (!current) return;
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  const distance = Math.max(current.widthKm * .004, Math.min(current.widthKm * .055, camera.position.distanceTo(controls.target) * .09));
  const vector = direction === 'up' ? forward : direction === 'down' ? forward.clone().negate() : direction === 'right' ? right : right.clone().negate();
  const dx = vector.x * distance * amount, dz = vector.z * distance * amount;
  camera.position.x += dx; camera.position.z += dz;
  controls.target.x += dx; controls.target.z += dz;
  clampTarget();
  controls.update();
  invalidate();
}

function render(now) {
  frameQueued = false;
  const dt = Math.min(.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  if (animation) {
    const t = Math.min(1, (now - animation.start) / 650);
    const e = t * t * (3 - 2 * t);
    const phi = THREE.MathUtils.lerp(animation.from, animation.to, e);
    const offset = camera.position.clone().sub(controls.target);
    const sphere = new THREE.Spherical().setFromVector3(offset);
    sphere.phi = phi;
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sphere));
    if (t >= 1) animation = null;
  }
  if (pressed.size && dt) for (const direction of pressed) move(direction, dt * 8);
  if (current) clampTarget();
  controls.update();
  renderer.render(scene, camera);
  if (animation || gestureActive || pressed.size) invalidate();
}

function buildGeometry(elevation, data) {
  const n = catalog.grid;
  const count = n * n;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const i = row * n + col;
    positions[i * 3] = (col / (n - 1) - .5) * data.widthKm;
    positions[i * 3 + 1] = elevation[i] * exaggeration;
    positions[i * 3 + 2] = (row / (n - 1) - .5) * data.widthKm;
    uvs[i * 2] = col / (n - 1);
    uvs[i * 2 + 1] = 1 - row / (n - 1);
  }
  let k = 0;
  for (let row = 0; row < n - 1; row++) for (let col = 0; col < n - 1; col++) {
    const a = row * n + col, b = a + 1, c = a + n, d = c + 1;
    indices[k++] = a; indices[k++] = c; indices[k++] = b;
    indices[k++] = b; indices[k++] = c; indices[k++] = d;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function updateExaggeration() {
  if (!terrain || !baseElevation) return;
  const y = terrain.geometry.attributes.position;
  for (let i = 0; i < baseElevation.length; i++) y.setY(i, baseElevation[i] * exaggeration);
  y.needsUpdate = true;
  terrain.geometry.computeVertexNormals();
  terrain.geometry.computeBoundingSphere();
  const ground = heightAt(controls.target.x, controls.target.z);
  camera.position.y += ground - controls.target.y;
  controls.target.y = ground;
  $('#exaggeration-label').textContent = `× ${exaggeration}`;
  $('#height-button span').textContent = `RELIEF × ${exaggeration}`;
  updateEdge();
  invalidate();
}

function updateEdge() {
  if (edges) { scene.remove(edges); edges.geometry.dispose(); edges.material.dispose(); }
  const n = catalog.grid, w = current.widthKm;
  const points = [];
  for (let i = 0; i < n; i += 4) {
    const p = i / (n - 1) - .5;
    points.push(new THREE.Vector3(p * w, heightAt(p * w, -w / 2) + .004, -w / 2));
  }
  points.push(new THREE.Vector3(w / 2, heightAt(w / 2, -w / 2) + .004, -w / 2));
  for (let i = 0; i < n; i += 4) {
    const p = i / (n - 1) - .5;
    points.push(new THREE.Vector3(w / 2, heightAt(w / 2, p * w) + .004, p * w));
  }
  for (let i = n - 1; i >= 0; i -= 4) {
    const p = i / (n - 1) - .5;
    points.push(new THREE.Vector3(p * w, heightAt(p * w, w / 2) + .004, w / 2));
  }
  for (let i = n - 1; i >= 0; i -= 4) {
    const p = i / (n - 1) - .5;
    points.push(new THREE.Vector3(-w / 2, heightAt(-w / 2, p * w) + .004, p * w));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  edges = new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color:0x98dcee, transparent:true, opacity:.55 }));
  scene.add(edges);
}

async function loadSite(site) {
  const key = `${body}-${site.id}`;
  const data = catalog.sites[key];
  if (!data) throw new Error(`Site NASA indisponible : ${key}`);
  activeSite = site.id;
  $('#loading').classList.remove('done');
  $('#site-title').textContent = site.name;
  $('#site-description').textContent = site.description;
  $('#coverage').textContent = `${data.widthKm} × ${data.widthKm} km`;
  $('#elevation-range').textContent = `${data.minMeters.toLocaleString('fr-FR')} à ${data.maxMeters.toLocaleString('fr-FR')} m`;
  $('#elevation-source').href = data.elevationUrl;
  $('#imagery-source').href = data.imageryUrl;
  $('#data-note').textContent = `${data.elevation}. Maillage 3D : ${Math.round(data.meshMeters)} m. ${data.imagery}. Relief amplifié × ${exaggeration}.`;
  $('#scene-credit').textContent = `${data.elevation} · ${data.imagery}`.toUpperCase();
  document.querySelectorAll('[data-site]').forEach(button => button.classList.toggle('active', button.dataset.site === site.id));
  history.replaceState({}, '', appURL(`pages/terrain.html?body=${body}&site=${encodeURIComponent(site.id)}`).href);

  let entry = siteCache.get(key);
  if (!entry) {
    entry = Promise.all([
      fetch(appURL(`assets/terrain/${key}.bin`)).then(response => { if (!response.ok) throw new Error(`Relief ${response.status}`); return response.arrayBuffer(); }),
      textureLoader.loadAsync(appURL(`assets/terrain/${key}.webp`).href),
    ]).then(([buffer, texture]) => {
      if (buffer.byteLength !== catalog.grid * catalog.grid * 2) throw new Error('Fichier altimétrique incomplet');
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      const encoded = new Uint16Array(buffer);
      const elevations = new Float32Array(encoded.length);
      const span = data.maxMeters - data.minMeters;
      for (let i = 0; i < encoded.length; i++) elevations[i] = (encoded[i] / 65535 * span) / 1000;
      return { elevations, texture };
    });
    siteCache.set(key, entry);
  }
  const { elevations, texture } = await entry;
  if (activeSite !== site.id) return;
  if (terrain) { scene.remove(terrain); terrain.geometry.dispose(); terrain.material.dispose(); }
  baseElevation = elevations;
  current = data;
  terrain = new THREE.Mesh(buildGeometry(elevations, data), new THREE.MeshStandardMaterial({ map:texture, roughness:1, metalness:0, side:THREE.DoubleSide }));
  scene.add(terrain);
  updateEdge();
  resetView(false);
  $('#loading').classList.add('done');
  invalidate();
}

function resetView(animate = true) {
  if (!current) return;
  animation = null;
  const center = heightAt(0, 0);
  const target = new THREE.Vector3(0, center, 0);
  const width = current.widthKm;
  const distance = width * (window.innerWidth < 760 ? 1.12 : .82);
  const destination = target.clone().add(new THREE.Vector3(width * .25, distance * .73, distance * .69));
  controls.target.copy(target);
  camera.position.copy(destination);
  controls.minDistance = Math.max(.025, width * .002);
  controls.maxDistance = width * 3.5;
  camera.near = Math.max(.0004, width / 100000);
  camera.far = width * 8;
  camera.updateProjectionMatrix();
  scene.fog.density = .38 / width;
  controls.update();
  $('#tilt-button span').textContent = 'VUE DU DESSUS';
  invalidate();
}

function toggleTilt() {
  if (!current) return;
  const offset = camera.position.clone().sub(controls.target);
  const phi = new THREE.Spherical().setFromVector3(offset).phi;
  const topDown = phi > .55;
  animation = { start:performance.now(), from:phi, to:topDown ? .09 : 1.04 };
  $('#tilt-button span').textContent = topDown ? 'VUE OBLIQUE' : 'VUE DU DESSUS';
  invalidate();
}

function zoom(factor) {
  if (!current) return;
  const offset = camera.position.clone().sub(controls.target);
  offset.multiplyScalar(factor);
  offset.clampLength(controls.minDistance, controls.maxDistance);
  camera.position.copy(controls.target).add(offset);
  controls.update();
  invalidate();
}

function focusAtPointer(event) {
  if (!terrain) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(terrain, false)[0];
  if (!hit) return;
  const displacement = hit.point.clone().sub(controls.target);
  controls.target.copy(hit.point);
  camera.position.add(displacement);
  clampTarget();
  controls.update();
  invalidate();
}

function renderSites() {
  $('#site-list').replaceChildren(...sites.map((site, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.site = site.id;
    button.innerHTML = `<span>${String(index + 1).padStart(2, '0')} · ${site.name}</span><span aria-hidden="true">↗</span>`;
    button.addEventListener('click', () => loadSite(site).catch(showError));
    return button;
  }));
}

function showError(error) {
  console.error(error);
  $('#loading').classList.add('done');
  $('#error').textContent = `Impossible de charger le terrain NASA. ${error.message || 'Réessayez après avoir rechargé la page.'}`;
  $('#error').hidden = false;
}

$('#tilt-button').addEventListener('click', toggleTilt);
$('#height-button').addEventListener('click', () => {
  exaggeration = exaggeration === 2 ? 1 : exaggeration === 1 ? 3 : 2;
  updateExaggeration();
  if (current) $('#data-note').textContent = `${current.elevation}. Maillage 3D : ${Math.round(current.meshMeters)} m. ${current.imagery}. Relief amplifié × ${exaggeration}.`;
});
$('#reset-button').addEventListener('click', resetView);
$('#zoom-in').addEventListener('click', () => zoom(.58));
$('#zoom-out').addEventListener('click', () => zoom(1.7));
document.querySelectorAll('[data-move]').forEach(button => {
  const direction = button.dataset.move;
  button.addEventListener('pointerdown', event => { event.preventDefault(); button.setPointerCapture(event.pointerId); pressed.add(direction); move(direction); invalidate(); });
  const stop = () => pressed.delete(direction);
  button.addEventListener('pointerup', stop);
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', stop);
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  const direction = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' }[event.key];
  if (!direction) return;
  event.preventDefault();
  pressed.add(direction);
  invalidate();
});
window.addEventListener('keyup', event => {
  const direction = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right', w:'up', s:'down', a:'left', d:'right' }[event.key];
  if (direction) pressed.delete(direction);
});
window.addEventListener('blur', () => pressed.clear());

async function start() {
  try {
    const response = await fetch(appURL('assets/terrain/catalog.json'));
    if (!response.ok) throw new Error('Catalogue du relief indisponible');
    catalog = await response.json();
    setup();
    renderSites();
    const selected = sites.find(site => site.id === params.get('site')) || sites[0];
    await loadSite(selected);
  } catch (error) { showError(error); }
}

start();
