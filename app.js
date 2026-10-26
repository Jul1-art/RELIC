import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SurfaceDetail } from './surface-detail.js?v=5';
import { PLANET_SITES, NASA_IMAGERY } from './nasa-worlds.js';
import { startLiveData, getLanguage, onLanguageChange } from './atlas-live.js?v=3';
import { navigateTo } from './navigation.js';
import { initializePlanetDashboard, setDashboardBody } from './planet-dashboard.js';
import { createViewLoading } from './view-loading.js';
import { initializeProviderCredits } from './provider-credits.js';

const dashboard = initializePlanetDashboard({ view:'atlas' });

const $ = selector => document.querySelector(selector);
const sceneHost = $('#scene');
const labelHost = $('#planet-labels');
const loading = $('#loading');
const errorScreen = $('#error-screen');
const viewLoading = createViewLoading({ element:loading, errorElement:errorScreen, getLanguage });
const viewportSize = () => ({ width:Math.max(1, sceneHost.clientWidth), height:Math.max(1, sceneHost.clientHeight) });
const sky = new THREE.Color('#050505');
let filmActive = window.__relicFilmActive === true || document.documentElement.dataset.relicFilm === 'active';
const gestureHint = $('#gesture-hint');
let gestureHintTimer;
function showGestureHint() {
  clearTimeout(gestureHintTimer);
  gestureHint.hidden = false;
  gestureHintTimer = setTimeout(() => { gestureHint.hidden = true; }, 5200);
}
function hideGestureHint() {
  clearTimeout(gestureHintTimer);
  gestureHint.hidden = true;
}
function preferredPixelRatio() {
  const mobile = sceneHost.clientWidth <= 760 || matchMedia('(pointer: coarse)').matches;
  const high = document.documentElement.dataset.quality === 'high';
  const pixelBudget = high ? mobile ? 3000000 : 6000000 : mobile ? 1500000 : 4000000;
  const {width,height} = viewportSize();
  const area = width * height;
  return Math.min(window.devicePixelRatio || 1, high ? 2 : mobile ? 1.6 : 1.75, Math.max(.85, Math.sqrt(pixelBudget / area)));
}
let renderPixelRatio = preferredPixelRatio();

const planets = [
  { id:'mercury', name:'Mercure', kind:'Planète tellurique', color:'#aeb0b2', orbit:12, size:1.38, phase:.28, period:88, spin:58.6, tilt:.03, subtitle:'Le monde le plus proche du Soleil', description:'Une surface criblée de cratères, sculptée par des milliards d’années d’impacts.', facts:[['DISTANCE DU SOLEIL','0,39 UA'],['UNE ANNÉE','88 jours'],['DIAMÈTRE','4 879 km']] },
  { id:'venus', name:'Vénus', kind:'Planète tellurique', color:'#e6c69a', orbit:18.5, size:1.8, phase:2.73, period:225, spin:-243, tilt:177, subtitle:'Notre voisine voilée', description:'Sous ses épais nuages, Vénus abrite un paysage volcanique et une chaleur extrême.', facts:[['DISTANCE DU SOLEIL','0,72 UA'],['UNE ANNÉE','225 jours'],['TEMPÉRATURE','≈ 465 °C']] },
  { id:'earth', name:'Terre', kind:'Planète tellurique', color:'#6aa9ef', orbit:25.5, size:1.9, phase:5.19, period:365, spin:1, tilt:23.4, subtitle:'Notre planète bleue', description:'Un monde d’océans, de continents et de vie. Approchez-vous pour découvrir sa surface.', facts:[['DISTANCE DU SOLEIL','1 UA'],['UNE ANNÉE','365 jours'],['DIAMÈTRE','12 742 km']] },
  { id:'mars', name:'Mars', kind:'Planète tellurique', color:'#d97a59', orbit:33, size:1.6, phase:1.42, period:687, spin:1.03, tilt:25.2, subtitle:'La planète rouge', description:'Déserts de poussière, volcans géants et traces d’anciens cours d’eau.', facts:[['DISTANCE DU SOLEIL','1,52 UA'],['UNE ANNÉE','687 jours'],['DIAMÈTRE','6 779 km']] },
  { id:'jupiter', name:'Jupiter', kind:'Géante gazeuse', color:'#d7aa84', orbit:43, size:3.15, phase:3.57, period:4333, spin:.41, tilt:3.1, subtitle:'La reine des géantes', description:'Des bandes de nuages immenses enveloppent la plus grande planète du système.', facts:[['DISTANCE DU SOLEIL','5,20 UA'],['UNE ANNÉE','11,9 ans'],['DIAMÈTRE','139 820 km']] },
  { id:'saturn', name:'Saturne', kind:'Géante gazeuse', color:'#e7cda0', orbit:54, size:2.72, phase:.77, period:10759, spin:.45, tilt:26.7, subtitle:'L’architecture des anneaux', description:'Une géante légère entourée d’anneaux faits de milliards de fragments glacés.', facts:[['DISTANCE DU SOLEIL','9,58 UA'],['UNE ANNÉE','29,5 ans'],['DIAMÈTRE','116 460 km']] },
  { id:'uranus', name:'Uranus', kind:'Géante glacée', color:'#99d6df', orbit:65, size:2.15, phase:4.9, period:30687, spin:-.72, tilt:97.8, subtitle:'La planète couchée', description:'Cette géante glacée tourne presque sur le côté, dans une atmosphère bleu pâle.', facts:[['DISTANCE DU SOLEIL','19,2 UA'],['UNE ANNÉE','84 ans'],['DIAMÈTRE','50 724 km']] },
  { id:'neptune', name:'Neptune', kind:'Géante glacée', color:'#537bdf', orbit:77, size:2.12, phase:2.25, period:60190, spin:.67, tilt:28.3, subtitle:'Aux confins de notre système', description:'Un monde bleu profond balayé par les vents les plus rapides des planètes.', facts:[['DISTANCE DU SOLEIL','30,1 UA'],['UNE ANNÉE','164,8 ans'],['DIAMÈTRE','49 244 km']] }
];

const englishBodies = {
  mercury:{ name:'Mercury', kind:'Rocky planet', subtitle:'The closest world to the Sun', description:'A small rocky world marked by ancient impact craters.' },
  venus:{ name:'Venus', kind:'Rocky planet', subtitle:'Our cloud-covered neighbour', description:'A dense atmosphere hides its hot rocky surface.' },
  earth:{ name:'Earth', kind:'Rocky planet', subtitle:'Our blue planet', description:'A world of oceans, continents and life. Move closer to explore its surface.' },
  mars:{ name:'Mars', kind:'Rocky planet', subtitle:'The red planet', description:'Dusty deserts, giant volcanoes and traces of ancient water.' },
  jupiter:{ name:'Jupiter', kind:'Gas giant', subtitle:'The largest planet', description:'Immense cloud bands wrap the largest planet in our system.' },
  saturn:{ name:'Saturn', kind:'Gas giant', subtitle:'A world of rings', description:'A light giant surrounded by rings made of countless icy fragments.' },
  uranus:{ name:'Uranus', kind:'Ice giant', subtitle:'The tilted planet', description:'This ice giant rotates almost on its side beneath a pale blue atmosphere.' },
  neptune:{ name:'Neptune', kind:'Ice giant', subtitle:'At the edge of the planetary system', description:'A deep blue world with some of the fastest planetary winds.' },
  moon:{ name:'The Moon', kind:'Natural satellite', subtitle:'Earth’s satellite', description:'Explore the cratered surface of Earth’s natural satellite.' },
  sun:{ name:'The Sun', kind:'G2V star', subtitle:'The light of our system', description:'Our star powers the planets and the solar wind.' },
};
const displayBody = detail => getLanguage() === 'en' ? { ...detail, ...englishBodies[detail.id] } : detail;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false, logarithmicDepthBuffer:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(renderPixelRatio);
  renderer.setSize(viewportSize().width, viewportSize().height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .94;
  sceneHost.appendChild(renderer.domElement);
} catch {
  viewLoading.fail();
  throw new Error('The 3D renderer could not start.');
}

const scene = new THREE.Scene();
scene.background = sky;
const camera = new THREE.PerspectiveCamera(40, viewportSize().width / viewportSize().height, .0000001, 1200);
const overviewPosition = () => sceneHost.clientWidth <= 560 ? new THREE.Vector3(0, 210, 120) : sceneHost.clientWidth <= 800 ? new THREE.Vector3(0, 160, 135) : new THREE.Vector3(0, 103, 166);
const overviewScale = () => sceneHost.clientWidth <= 560 ? .53 : sceneHost.clientWidth <= 800 ? .78 : 1;
let sceneScale = overviewScale();
camera.position.copy(overviewPosition());
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.enablePan = false;
controls.minDistance = 18;
controls.maxDistance = 280;
controls.rotateSpeed = .5;
controls.zoomSpeed = 1.4;
controls.target.set(0, 0, 0);
controls.update();
scene.add(new THREE.HemisphereLight(0xffffff, 0x27344b, .8));
scene.add(new THREE.AmbientLight(0xffffff, .48));
const sunlight = new THREE.PointLight(0xffdeb0, 200, 0, 1.5);
scene.add(sunlight);

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function paintedTexture(base, stripes, seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const random = seeded(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < (stripes ? 115 : 540); i++) {
    const x = random() * 1024, y = random() * 512;
    const width = stripes ? 1024 : 4 + random() * 55;
    const height = stripes ? 1 + random() * 12 : 2 + random() * 24;
    ctx.fillStyle = stripes ? (random() > .48 ? 'rgba(255,239,211,.09)' : 'rgba(77,47,42,.09)') : (random() > .5 ? 'rgba(255,255,255,.06)' : 'rgba(20,24,35,.12)');
    ctx.beginPath(); ctx.ellipse(stripes ? 512 : x, y, width, height, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (stripes) {
    for (let i = 0; i < 45; i++) {
      const y = random() * 512;
      ctx.fillStyle = random() > .5 ? 'rgba(255,235,201,.08)' : 'rgba(63,45,48,.1)';
      ctx.fillRect(0, y, 1024, 1 + random() * 10);
    }
  } else {
    for (let i = 0; i < 85; i++) {
      const x = random() * 1024, y = random() * 512, r = 2 + random() * 18;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * .75, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(222,230,239,.12)'; ctx.lineWidth = 1 + random() * 2; ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function sunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const random = seeded(23148);
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#ffd778'); gradient.addColorStop(.24, '#ffb144'); gradient.addColorStop(.53, '#f57427'); gradient.addColorStop(.8, '#ffa23e'); gradient.addColorStop(1, '#ffe095');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 1600; i++) {
    const x = random() * 1024, y = random() * 512;
    const radius = 3 + random() * 34;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, random() > .5 ? 'rgba(255,240,163,.34)' : 'rgba(159,46,24,.2)');
    glow.addColorStop(1, 'rgba(255,115,27,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(x, y, radius, 1 + random() * 9, 0, 0, Math.PI * 2); ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 13, 128, 128, 127);
  gradient.addColorStop(0, 'rgba(255,170,50,.58)');
  gradient.addColorStop(.2, 'rgba(255,102,22,.25)');
  gradient.addColorStop(.58, 'rgba(255,80,15,.055)');
  gradient.addColorStop(1, 'rgba(255,103,35,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

const pickable = [];
const sun = new THREE.Mesh(new THREE.SphereGeometry(4.55, 96, 64), new THREE.MeshBasicMaterial({ map:sunTexture() }));
sun.userData.id = 'sun';
scene.add(sun); pickable.push(sun);
const solarGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map:glowTexture(), color:0xff9b40, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:.58 }));
solarGlow.scale.set(27, 27, 1); scene.add(solarGlow);
const solarCorona = new THREE.Mesh(new THREE.SphereGeometry(4.66, 64, 48), new THREE.MeshBasicMaterial({ color:0xff8730, transparent:true, opacity:.035, blending:THREE.AdditiveBlending, depthWrite:false, side:THREE.BackSide }));
scene.add(solarCorona);

const starsGeometry = new THREE.BufferGeometry();
const starPositions = [];
const starRandom = seeded(62517);
for (let i = 0; i < 1550; i++) {
  const phi = starRandom() * Math.PI * 2, cosine = starRandom() * 2 - 1, radial = 330 + starRandom() * 400;
  const sine = Math.sqrt(1 - cosine * cosine);
  starPositions.push(radial * sine * Math.cos(phi), radial * cosine, radial * sine * Math.sin(phi));
}
starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color:0xa6bddb, size:1.4, sizeAttenuation:false, transparent:true, opacity:.67, depthWrite:false })));

const orbitLines = new Map();
const planetGroups = new Map();
const planetMeshes = new Map();
const loader = new THREE.TextureLoader();
function loadLocalMap(path, material, onLoad) {
  loader.load(path, texture => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    material.map = texture; material.color.set(0xffffff); material.needsUpdate = true;
    if (material.isMeshStandardMaterial) material.emissiveMap = texture;
    onLoad?.(material);
  }, undefined, error => console.warn('Carte locale indisponible :', path, error));
}

function addAtmosphere(group, radius, color, strength) {
  const material = new THREE.ShaderMaterial({
    uniforms:{ tint:{value:new THREE.Color(color)}, strength:{value:strength} },
    vertexShader:'varying vec3 vNormal; varying vec3 vView; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); vNormal=normalize(normalMatrix*normal); vView=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader:'uniform vec3 tint; uniform float strength; varying vec3 vNormal; varying vec3 vView; void main(){ float edge=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),2.6); gl_FragColor=vec4(tint,edge*strength); }',
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, side:THREE.FrontSide
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 48, 32), material);
  group.add(atmosphere);
  group.userData.atmosphere = atmosphere;
}

// The highlight illustrates orbital direction. Its visual cycle is deliberately
// independent of ephemeris time; planetary positions continue to use source data.
function orbitLine(radius, index = 0) {
  const points = [], progress = [];
  for (let i = 0; i <= 360; i++) {
    const phase = i / 360;
    points.push(new THREE.Vector3(Math.cos(phase * Math.PI * 2) * radius, 0, Math.sin(phase * Math.PI * 2) * radius));
    progress.push(phase);
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  geometry.setAttribute('orbitProgress', new THREE.Float32BufferAttribute(progress, 1));
  const material = new THREE.ShaderMaterial({
    uniforms:{ elapsed:{value:0}, phase:{value:index * .137}, rate:{value:1 / (22 + index * 2)}, strength:{value:.75} },
    vertexShader:'attribute float orbitProgress; varying float vProgress; void main(){vProgress=orbitProgress;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform float elapsed;uniform float phase;uniform float rate;uniform float strength;varying float vProgress;void main(){float behind=fract(phase+elapsed*rate-vProgress);float trail=pow(1.0-behind,30.0);vec3 color=mix(vec3(.16,.32,.53),vec3(.30,.64,1.0),trail);gl_FragColor=vec4(color,strength*(.20+.80*trail));}',
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geometry, material);
  scene.add(line); return line;
}

function saturnRingGeometry(inner, outer) {
  const geometry = new THREE.BufferGeometry();
  const positions = [], uvs = [], indices = [];
  for (let segment = 0; segment <= 192; segment++) {
    const angle = segment / 192 * Math.PI * 2;
    const x = Math.cos(angle), y = Math.sin(angle);
    positions.push(x * inner, y * inner, 0, x * outer, y * outer, 0);
    uvs.push(0, .5, 1, .5);
    if (segment < 192) {
      const i = segment * 2;
      indices.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const planetaryMaps = {
  mercury:'mercury', venus:'venus', jupiter:'jupiter', saturn:'saturn', uranus:'uranus', neptune:'neptune'
};

for (let index = 0; index < planets.length; index++) {
  const planet = planets[index];
  const line = orbitLine(planet.orbit, index);
  line.scale.setScalar(sceneScale);
  orbitLines.set(planet.id, line);
  const group = new THREE.Group();
  scene.add(group);
  const texture = paintedTexture(planet.color, ['venus','jupiter','saturn','uranus','neptune'].includes(planet.id), index * 1837 + 72);
  const material = new THREE.MeshStandardMaterial({ map:texture, emissive:0xffffff, emissiveMap:texture, emissiveIntensity:.12, roughness:1, metalness:0 });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(planet.size, 160, 112), material);
  mesh.userData.id = planet.id;
  mesh.rotation.z = THREE.MathUtils.degToRad(planet.tilt || 0);
  group.add(mesh);
  pickable.push(mesh);
  planetGroups.set(planet.id, group);
  planetMeshes.set(planet.id, mesh);
  if (planetaryMaps[planet.id]) loadLocalMap(`./assets/${planetaryMaps[planet.id]}-scope.webp`, material);
  if (planet.id === 'earth') {
    loadLocalMap('./assets/earth-blue-marble-4k.webp', material);
    addAtmosphere(group, planet.size, '#4b9ff3', .24);
  } else if (planet.id === 'mars') {
    loadLocalMap('./assets/mars-viking-global.webp', material);
    addAtmosphere(group, planet.size, '#ec8362', .08);
  } else if (planet.id === 'venus') {
    addAtmosphere(group, planet.size, '#f3d2a1', .15);
  } else if (planet.id === 'neptune') {
    addAtmosphere(group, planet.size, '#4274e2', .13);
  } else if (planet.id === 'saturn') {
    const ringMaterial = new THREE.MeshBasicMaterial({ color:0xffffff, side:THREE.DoubleSide, transparent:true, depthWrite:false });
    const rings = new THREE.Mesh(saturnRingGeometry(planet.size * 1.23, planet.size * 2.25), ringMaterial);
    rings.rotation.x = -Math.PI / 2;
    rings.rotation.z = .12;
    group.add(rings);
    loadLocalMap('./assets/saturn-ring-scope.png', ringMaterial);
  }
}
loadLocalMap('./assets/sun-scope.webp', sun.material);

const earth = planets.find(planet => planet.id === 'earth');
const moon = new THREE.Mesh(new THREE.SphereGeometry(.62, 192, 128), new THREE.MeshStandardMaterial({ color:0xffffff, emissive:0xffffff, emissiveIntensity:.12, roughness:1 }));
moon.userData.id = 'moon';
moon.visible = false;
scene.add(moon); pickable.push(moon);
let moonTextureRequested = false;
let moonTextureLoaded = false;
function ensureMoonTexture() {
  if (moonTextureRequested) return;
  moonTextureRequested = true;
  loadLocalMap('./assets/moon-wac-8k.webp', moon.material, material => {
    moonTextureLoaded = true;
    if (selected === 'moon') showBaseImageryCredit('moon');
    if (window.innerWidth > 760) loader.load('./assets/moon-lola-relief.webp', bump => {
      material.bumpMap = bump; material.bumpScale = .008; material.needsUpdate = true;
    });
  });
}
const moonOrbit = orbitLine(4.35);
moonOrbit.visible = false;
const moonData = { id:'moon', name:'La Lune', kind:'Satellite naturel', color:'#c8c9c3', size:.62, subtitle:'Le satellite de la Terre', description:'Un paysage de cratères et de mers anciennes, cartographié par les missions lunaires.', facts:[['DISTANCE DE LA TERRE','384 400 km'],['UNE ORBITE','27,3 jours'],['DIAMÈTRE','3 475 km']] };
const liveVectors = new Map();

function updatePositions(days) {
  for (const planet of planets) {
    const group = planetGroups.get(planet.id);
    const vector = liveVectors.get(planet.id);
    if (vector) {
      const { x, y, z } = vector;
      const distance = Math.hypot(x, y, z);
      group.position.set(x / distance * planet.orbit * sceneScale, z / distance * planet.orbit * sceneScale, y / distance * planet.orbit * sceneScale);
    } else {
      const angle = planet.phase + days * Math.PI * 2 / planet.period;
      group.position.set(Math.cos(angle) * planet.orbit * sceneScale, 0, Math.sin(angle) * planet.orbit * sceneScale);
    }
  }
  const earthPosition = planetGroups.get('earth').position;
  const moonAngle = .55 + days * Math.PI * 2 / 27.32;
  moon.position.set(earthPosition.x + Math.cos(moonAngle) * 4.35, .08, earthPosition.z + Math.sin(moonAngle) * 4.35);
  moonOrbit.position.copy(earthPosition);
}

const nav = $('#planet-navigation');
for (const [index, planet] of planets.entries()) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'planet-link'; button.dataset.body = planet.id;
  button.setAttribute('aria-label', `Explorer ${planet.name}`);
  button.innerHTML = `<span class="planet-orb" style="background:radial-gradient(circle at 30% 25%,#ffffff44,transparent 48%),url('./assets/${planet.id === 'earth' ? 'earth-blue-marble-4k' : planet.id === 'mars' ? 'mars-viking-global' : planet.id + '-scope'}.webp') center / cover, ${planet.color}"></span><span class="planet-copy"><strong>${planet.name}</strong></span>`;
  button.addEventListener('click', () => selectBody(planet.id, true));
  nav.appendChild(button);
}
const mobileSun = document.createElement('button');
mobileSun.type = 'button'; mobileSun.className = 'planet-link mobile-sun'; mobileSun.dataset.body = 'sun';
mobileSun.innerHTML = '<span class="planet-orb" style="background:radial-gradient(circle at 30% 30%,#fff3bd,#ff9d43 52%,#963716);color:#fdb765"></span><span class="planet-copy"><strong>Soleil</strong></span>';
nav.prepend(mobileSun);
const moonLink = document.createElement('button');
moonLink.type = 'button'; moonLink.className = 'planet-link'; moonLink.dataset.body = 'moon';
moonLink.innerHTML = '<span class="planet-orb moon-orb"></span><span class="planet-copy"><strong>Lune</strong></span>';
moonLink.setAttribute('aria-label', 'Explorer la Lune');
moonLink.addEventListener('click', () => selectBody('moon', true));
nav.insertBefore(moonLink, nav.querySelector('[data-body="mars"]'));

const labels = new Map();
for (const planet of planets) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'planet-label';
  button.style.setProperty('--planet-color', planet.color);
  button.textContent = planet.name;
  button.dataset.labelVisible = 'false';
  button.setAttribute('aria-label', `Explorer ${planet.name}`);
  button.addEventListener('click', () => selectBody(planet.id));
  labelHost.appendChild(button); labels.set(planet.id, button);
}

let selected = 'overview';
let livePanel;
let flight = null;
let trackedPosition = null;
let simulationDays = 0;
const tempPosition = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const imageryCredit = $('#imagery-credit');
initializeProviderCredits({ viewport:dashboard.viewport, elements:[imageryCredit] });
function showBaseImageryCredit(id) {
  imageryCredit.hidden = false;
  imageryCredit.innerHTML = id === 'mars'
    ? `MOSAÏQUE GLOBALE VIKING · <a href="${NASA_IMAGERY.marsTrek}" target="_blank" rel="noopener noreferrer">NASA MARS TREK</a>`
    : id === 'moon'
      ? `MOSAÏQUE GLOBALE LROC WAC · <a href="${NASA_IMAGERY.moonTrek}" target="_blank" rel="noopener noreferrer">NASA MOON TREK</a>`
      : `${getLanguage() === 'fr' ? 'Textures planétaires' : 'Planetary textures'} · <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope / INOVE · CC BY 4.0</a> · NASA`;
}
const surfaceDetail = new SurfaceDetail(camera, renderer, state => {
  if (!state) {
    showBaseImageryCredit(selected);
    return;
  }
  imageryCredit.hidden = false;
  imageryCredit.innerHTML = state.unavailable
    ? `DÉTAIL DE SURFACE INDISPONIBLE · <a href="${state.id === 'mars' ? NASA_IMAGERY.marsTrek : state.id === 'moon' ? NASA_IMAGERY.moonTrek : NASA_IMAGERY.gibsInfo}" target="_blank" rel="noopener noreferrer">SOURCE NASA</a>`
    : state.loading
    ? 'CHARGEMENT DES DÉTAILS DE SURFACE…'
    : state.id === 'earth'
      ? `IMAGERIE BLUE MARBLE · <a href="${NASA_IMAGERY.gibsInfo}" target="_blank" rel="noopener noreferrer">NASA GIBS</a>`
      : state.id === 'mars'
        ? `IMAGERIE ${state.local ? 'JEZERO · HIRISE · ZONE LIMITÉE' : 'GLOBALE · VIKING'} · <a href="${NASA_IMAGERY.marsTrek}" target="_blank" rel="noopener noreferrer">NASA MARS TREK</a>`
        : `IMAGERIE ${state.local ? 'APOLLO 11 · LROC NAC · ZONE LIMITÉE' : 'GLOBALE · LROC WAC'} · <a href="${NASA_IMAGERY.moonTrek}" target="_blank" rel="noopener noreferrer">NASA MOON TREK</a>`;
});

function worldPosition(id) {
  if (id === 'sun') return sun.position;
  if (id === 'moon') return moon.position;
  return planetGroups.get(id).position;
}

function bodyData(id) {
  if (id === 'moon') return moonData;
  if (id === 'sun') return { id:'sun', name:'Le Soleil', kind:'Étoile · type G2V', color:'#ffad55', size:4.55, subtitle:'La lumière de notre système', description:'Au centre de notre système, son énergie éclaire et réchauffe tous les mondes.', facts:[['TYPE','Naine jaune'],['DIAMÈTRE','1,39 million km'],['ÂGE','4,6 milliards d’années']] };
  return planets.find(planet => planet.id === id);
}

function flyTo(target, position, duration = 720) {
  const reduced = document.documentElement.dataset.motion === 'reduced'
    || (!document.documentElement.dataset.motion && matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (reduced) {
    flight = null;
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
    return;
  }
  duration = Math.min(duration, 820);
  flight = { fromPosition:camera.position.clone(), fromTarget:controls.target.clone(), toPosition:position.clone(), toTarget:target.clone(), start:performance.now(), duration };
}

function refreshOrbits() {
  for (const planet of planets) {
    const line = orbitLines.get(planet.id);
    line.visible = selected === 'overview';
    line.material.uniforms.strength.value = .75;
  }
  moonOrbit.visible = false;
}

function setDetailsCollapsed(collapsed) {
  $('#details').classList.toggle('collapsed', collapsed);
  $('#details-toggle').setAttribute('aria-expanded', String(!collapsed));
  const label = getLanguage() === 'en'
    ? collapsed ? 'Show details' : 'Collapse details'
    : collapsed ? 'Afficher les détails' : 'Réduire les détails';
  $('#details-toggle').setAttribute('aria-label', label);
  $('#info-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('#info-toggle').setAttribute('aria-label', label);
}

function updateDetail(id) {
  const detail = id === 'overview' ? null : displayBody(bodyData(id));
  $('#details').hidden = !detail;
  $('#info-toggle').hidden = !detail;
  if (!detail) {
    delete document.body.dataset.world;
    return;
  }
  livePanel?.render();
  $('#detail-category').textContent = detail.kind;
  $('#detail-name').textContent = detail.name;
  $('#detail-subtitle').textContent = detail.subtitle;
  $('#detail-orb').style.background = `radial-gradient(circle at 32% 30%,#ffffffab,${detail.color} 45%,#132033)`;
  const actions = $('#detail-actions'); actions.replaceChildren();
  
  const close = document.createElement('button');
  close.type = 'button'; close.className = 'detail-action';
  close.textContent = getLanguage() === 'en' ? 'Move closer' : 'Se rapprocher';
  close.addEventListener('click', approachSurface);
  actions.appendChild(close);
  if (id in PLANET_SITES) document.body.dataset.world = id;
  else delete document.body.dataset.world;
}

function selectBody(id, recenter = false) {
  if (id === 'earth') { navigateTo('./earth.html'); return; }
  if (selected === id && id !== 'overview') {
    if (!recenter) return;
    const target = worldPosition(id).clone();
    const direction = camera.position.clone().sub(controls.target).normalize();
    flyTo(target, target.clone().addScaledVector(direction, bodyData(id).size * (id === 'saturn' ? 5.1 : id === 'sun' ? 3.9 : 3.1)), 800);
    showGestureHint();
    return;
  }
  surfaceDetail.clear();
  selected = id;
  setDashboardBody(id);
  $('#relic-replay').hidden = id !== 'overview';
  if (id === 'moon') ensureMoonTexture();
  if (id === 'overview') hideGestureHint(); else showGestureHint();
  $('.topbar-hint').innerHTML = getLanguage() === 'en'
    ? id === 'overview' ? 'DRAG TO ROTATE <span>·</span> PINCH OR SCROLL TO ZOOM' : 'DRAG TO MOVE <span>·</span> PINCH OR SCROLL TO ZOOM'
    : id === 'overview' ? 'GLISSER POUR TOURNER <span>·</span> PINCER OU DÉFILER POUR ZOOMER' : 'GLISSER POUR SE DÉPLACER <span>·</span> PINCER OU DÉFILER POUR ZOOMER';
  showBaseImageryCredit(id);
  if (id === 'moon' && !moonTextureLoaded) imageryCredit.textContent = getLanguage() === 'en' ? 'Loading NASA lunar imagery…' : 'Chargement de la carte lunaire NASA…';
  document.body.dataset.mode = id === 'overview' ? 'overview' : 'focus';
  document.querySelectorAll('[data-body]').forEach(element => element.classList.toggle('active', element.dataset.body === id));
  const destination = nav.querySelector(`[data-body="${id}"]`);
  if (destination) {
    const left = destination.offsetLeft - nav.clientWidth / 2 + destination.offsetWidth / 2;
    nav.scrollTo({ left, behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  updateDetail(id);
  setDetailsCollapsed(id !== 'overview' && window.innerWidth <= 760);
  moon.visible = id === 'earth' || id === 'moon';
  refreshOrbits();
  if (id === 'overview') {
    controls.minDistance = 18;
    controls.enableZoom = true;
    trackedPosition = null;
    flyTo(new THREE.Vector3(), overviewPosition(), 1250);
    return;
  }
  const detail = bodyData(id);
  const target = worldPosition(id).clone();
  const toSun = target.clone().multiplyScalar(-1);
  const direction = toSun.lengthSq() > .01 ? toSun.normalize().multiplyScalar(.83).add(new THREE.Vector3(0,.55,0)).normalize() : new THREE.Vector3(.2,.55,1).normalize();
  controls.minDistance = detail.size * (id === 'mars' || id === 'moon' ? 1.0000006 : 1.0002);
  controls.maxDistance = 280;
  controls.enableZoom = false;
  trackedPosition = target.clone();
  const framing = id === 'saturn' ? 5.1 : id === 'sun' ? 3.9 : 3.1;
  flyTo(target, target.clone().add(direction.multiplyScalar(detail.size * framing)), 1150);
}

function approachSurface() {
  if (selected === 'overview') return;
  const target = worldPosition(selected).clone();
  const direction = camera.position.clone().sub(controls.target).normalize();
  const distance = Math.min(camera.position.distanceTo(controls.target), bodyData(selected).size * (selected === 'mars' || selected === 'moon' ? 1.014 : 1.35));
  flyTo(target, target.clone().add(direction.multiplyScalar(distance)), 900);
  if (window.innerWidth <= 760) setDetailsCollapsed(true);
}

document.querySelectorAll('[data-body="sun"]').forEach(element => element.addEventListener('click', () => selectBody('sun', true)));
$('#brand-home').addEventListener('click', event => { event.preventDefault(); selectBody('overview'); });
$('#overview-button').addEventListener('click', () => selectBody('overview'));
$('#details-toggle').addEventListener('click', () => setDetailsCollapsed(!$('#details').classList.contains('collapsed')));
$('#info-toggle').addEventListener('click', () => setDetailsCollapsed(!$('#details').classList.contains('collapsed')));
function zoomBy(factor, animateZoom = true) {
  flight = null;
  const difference = camera.position.clone().sub(controls.target);
  const radius = selected === 'overview' ? 0 : bodyData(selected).size;
  const distance = radius
    ? radius + (difference.length() - radius) * factor
    : difference.length() * factor;
  difference.setLength(THREE.MathUtils.clamp(distance, controls.minDistance, controls.maxDistance));
  if (animateZoom) flyTo(controls.target, controls.target.clone().add(difference), 240);
  else { camera.position.copy(controls.target).add(difference); controls.update(); }
}
let surfaceSettleUntil = 0;
controls.addEventListener('start', () => { flight = null; hideGestureHint(); surfaceSettleUntil = performance.now() + 180; });
controls.addEventListener('change', () => {
  if (selected === 'mars' || selected === 'moon') surfaceSettleUntil = performance.now() + 220;
});
renderer.domElement.addEventListener('wheel', event => {
  if (filmActive) return;
  if (selected === 'overview') return;
  event.preventDefault();
  zoomBy(Math.exp(Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY), 120) / 180), false);
}, { passive:false });

let pointerStart = null;
const touchPointers = new Map();
let pinchDistance = 0;
renderer.domElement.addEventListener('pointerdown', event => {
  if (filmActive) return;
  pointerStart = { x:event.clientX, y:event.clientY };
  if (event.pointerType !== 'touch') return;
  touchPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
  if (touchPointers.size === 2) {
    pointerStart = null;
    const [a, b] = [...touchPointers.values()];
    pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
renderer.domElement.addEventListener('pointermove', event => {
  if (filmActive) return;
  if ((selected === 'mars' || selected === 'moon') && (event.buttons || touchPointers.size)) surfaceSettleUntil = performance.now() + 190;
  if (event.pointerType !== 'touch' || !touchPointers.has(event.pointerId)) return;
  touchPointers.set(event.pointerId, { x:event.clientX, y:event.clientY });
  if (selected === 'overview' || touchPointers.size !== 2) return;
  const [a, b] = [...touchPointers.values()];
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  if (pinchDistance > 10 && distance > 10) zoomBy(pinchDistance / distance, false);
  pinchDistance = distance;
});
function releaseTouch(event) {
  if (event.pointerType !== 'touch') return;
  touchPointers.delete(event.pointerId);
  pinchDistance = 0;
}
renderer.domElement.addEventListener('pointercancel', releaseTouch);
renderer.domElement.addEventListener('pointerup', event => {
  if (filmActive) { pointerStart = null; releaseTouch(event); return; }
  releaseTouch(event);
  if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) { pointerStart = null; return; }
  pointerStart = null;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickable, false).find(result => result.object.visible);
  if (hit) selectBody(hit.object.userData.id);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (filmActive) return;
  if (event.buttons) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  renderer.domElement.style.cursor = raycaster.intersectObjects(pickable, false).some(result => result.object.visible) ? 'pointer' : 'grab';
});
renderer.domElement.addEventListener('dblclick', event => {
  if (filmActive) return;
  if (selected === 'overview') return;
  event.preventDefault();
  hideGestureHint();
  zoomBy(.22);
});

const labelWidths = new Map();
const labelMeasure = document.createElement('canvas').getContext('2d');
const labelCameraPosition = new THREE.Vector3();
const labelCameraDirection = new THREE.Vector3();
const labelPoint = new THREE.Vector3();
function positionLabels() {
  if (selected !== 'overview') return;
  const occupied = [];
  const {width,height} = viewportSize();
  const fontSize = width < 650 ? 11 : 12;
  labelMeasure.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  camera.getWorldPosition(labelCameraPosition); camera.getWorldDirection(labelCameraDirection);
  const focalLength = height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const project = (point,radius) => {
    const depth = labelPoint.copy(point).sub(labelCameraPosition).dot(labelCameraDirection);
    tempPosition.copy(point).project(camera);
    return {x:(tempPosition.x*.5+.5)*width,y:(-.5*tempPosition.y+.5)*height,z:tempPosition.z,depth,radius:radius*focalLength/Math.max(depth,.01)};
  };
  const sunScreen = project(sun.position,4.55);
  const candidates = planets.map(planet=>({planet,...project(planetGroups.get(planet.id).position,planet.size)}));
  // Prioritize readable bodies, then leave room around both text and planets.
  candidates.sort((a,b)=>b.radius-a.radius);
  for (const item of candidates) {
    const element=labels.get(item.planet.id), name=element.textContent;
    const key=`${fontSize}:${name}`;
    if(!labelWidths.has(key))labelWidths.set(key,Math.ceil(labelMeasure.measureText(name).width)+4);
    const w=labelWidths.get(key), h=28;
    const coveredBySun=item.depth>sunScreen.depth && Math.hypot(item.x-sunScreen.x,item.y-sunScreen.y)<Math.max(0,sunScreen.radius-item.radius*.3);
    let box=null;
    if(item.depth>0 && item.z>-1 && item.z<1 && item.radius>=1.8 && item.radius<Math.min(width,height)*.16 && !coveredBySun){
      for(const offset of [item.radius+9,-item.radius-h-7,item.radius+27]){
        const candidate={x:item.x-w/2,y:item.y+offset,w,h};
        if(candidate.x<12||candidate.x+w>width-12||candidate.y<12||candidate.y+h>height-12)continue;
        if(occupied.some(previous=>candidate.x<previous.x+previous.w+10&&candidate.x+w+10>previous.x&&candidate.y<previous.y+previous.h+5&&candidate.y+h+5>previous.y))continue;
        if(candidates.some(body=>body!==item&&body.depth>0&&Math.abs(candidate.x+w/2-body.x)<w/2+body.radius+3&&Math.abs(candidate.y+h/2-body.y)<h/2+body.radius+3))continue;
        box=candidate;break;
      }
    }
    const visible=Boolean(box);
    if(element.dataset.labelVisible!==String(visible)){element.dataset.labelVisible=String(visible);element.inert=!visible;}
    if(box){
      occupied.push(box);
      const x=Math.round(box.x*2)/2,y=Math.round(box.y*2)/2;
      if(element.dataset.screenPosition!==`${x},${y}`){element.style.transform=`translate3d(${x}px,${y}px,0)`;element.dataset.screenPosition=`${x},${y}`;}
    }
  }
}

function resize() {
  const {width,height} = viewportSize();
  camera.aspect = width / height; camera.updateProjectionMatrix();
  renderPixelRatio = Math.min(renderPixelRatio, preferredPixelRatio());
  renderer.setPixelRatio(renderPixelRatio);
  renderer.setSize(width, height, false);
  const nextScale = overviewScale();
  if (nextScale !== sceneScale) {
    sceneScale = nextScale;
    for (const line of orbitLines.values()) line.scale.setScalar(sceneScale);
    updatePositions(simulationDays);
    if (selected === 'overview') flyTo(new THREE.Vector3(), overviewPosition(), 720);
  }
}
window.addEventListener('resize', resize);
window.addEventListener('relic-preferences-change', () => {
  renderPixelRatio = preferredPixelRatio();
  renderer.setPixelRatio(renderPixelRatio);
  renderer.setSize(viewportSize().width, viewportSize().height, false);
  if (document.documentElement.dataset.motion === 'reduced' && flight) {
    camera.position.copy(flight.toPosition);
    controls.target.copy(flight.toTarget);
    flight = null;
    controls.update();
  }
});

updatePositions(0);
livePanel = startLiveData($('#live-data'), () => selected, positions => {
  liveVectors.clear();
  for (const [id, item] of Object.entries(positions)) {
    if ((item.state === 'current' || item.state === 'stale') && item.positionKm) liveVectors.set(id, item.positionKm);
  }
  updatePositions(simulationDays);
});
onLanguageChange(lang => {
  const english = lang === 'en';
  $('#brand-home .identity-copy strong').textContent = 'RELIC';
  $('#brand-home .identity-copy small').textContent = english ? 'Beyond the journey' : 'Au-delà du voyage';
  $('#brand-home').setAttribute('aria-label', english ? 'RELIC — return to the solar system' : 'RELIC — retour au système solaire');
  $('#overview-button span').textContent = english ? 'Solar system' : 'Système solaire';
  $('#scene').setAttribute('aria-label', english ? 'Interactive solar system' : 'Système solaire interactif');
  $('.destinations').setAttribute('aria-label', english ? 'Choose a world' : 'Choisir un monde');
  $('.toolbar').setAttribute('aria-label', english ? 'Exploration controls' : 'Commandes de l’exploration');
  for (const [id, en, fr] of [
    ['relic-replay','Watch the film','Revoir le film'],
    ['relic-credits','Sources and creators','Sources et créateurs'],
  ]) {
    const button = $(`#${id}`);
    if (!button) continue;
    button.setAttribute('aria-label', english ? en : fr);
    button.title = english ? en : fr;
  }
  viewLoading.refresh();
  $('#gesture-hint').innerHTML = lang === 'en'
    ? 'DRAG TO MOVE <span>·</span> PINCH OR SCROLL TO ZOOM'
    : 'GLISSEZ POUR VOUS DÉPLACER <span>·</span> PINCEZ OU DÉFILEZ POUR ZOOMER';
  $('#info-toggle').textContent = lang === 'en' ? 'Info' : 'Infos';
  for (const planet of planets) {
    const name = lang === 'en' ? englishBodies[planet.id].name : planet.name;
    nav.querySelector(`[data-body="${planet.id}"] strong`).textContent = name;
    const label = labels.get(planet.id);
    label.lastChild.textContent = name;
    label.setAttribute('aria-label', lang === 'en' ? `Explore ${name}` : `Explorer ${name}`);
  }
  moonLink.querySelector('strong').textContent = lang === 'en' ? 'Moon' : 'Lune';
  mobileSun.querySelector('strong').textContent = lang === 'en' ? 'Sun' : 'Soleil';
  $('.topbar-hint').innerHTML = lang === 'en'
    ? selected === 'overview' ? 'DRAG TO ROTATE <span>·</span> PINCH OR SCROLL TO ZOOM' : 'DRAG TO MOVE <span>·</span> PINCH OR SCROLL TO ZOOM'
    : selected === 'overview' ? 'GLISSER POUR TOURNER <span>·</span> PINCER OU DÉFILER POUR ZOOMER' : 'GLISSER POUR SE DÉPLACER <span>·</span> PINCER OU DÉFILER POUR ZOOMER';
  if (selected !== 'overview') updateDetail(selected);
  setDetailsCollapsed($('#details').classList.contains('collapsed'));
});
updateDetail('overview');
showBaseImageryCredit('overview');
refreshOrbits();
setDashboardBody('overview');
const atlasBodies = new Set(['overview','sun','moon',...planets.map(planet => planet.id)]);
const surfaceBodies = new Set(['earth','moon','mars']);
window.addEventListener('planet-dashboard-world', event => {
  const id = event.detail?.body;
  if (!atlasBodies.has(id) || surfaceBodies.has(id)) return;
  event.preventDefault();
  selectBody(id, true);
});
window.addEventListener('planet-dashboard-location', event => {
  const {body:id,lat,lon} = event.detail || {};
  if (!atlasBodies.has(id) || id === 'overview' || surfaceBodies.has(id) || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
  event.preventDefault();
  selectBody(id, true);
  const mesh = id === 'sun' ? sun : planetMeshes.get(id);
  const target = worldPosition(id).clone();
  const latitude = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(lat, -90, 90));
  const longitude = THREE.MathUtils.degToRad(lon);
  // Longitude follows the equirectangular texture; this is a globe orientation,
  // not a claim of measured terrain detail on worlds without surface tiles.
  const direction = new THREE.Vector3(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), -Math.cos(latitude) * Math.sin(longitude));
  mesh.updateWorldMatrix(true, false);
  direction.transformDirection(mesh.matrixWorld);
  const framing = id === 'saturn' ? 5.1 : id === 'sun' ? 3.9 : 2.5;
  flyTo(target, target.clone().addScaledVector(direction, bodyData(id).size * framing), 820);
});
const requestedBody = new URLSearchParams(window.location.search).get('body');
if (atlasBodies.has(requestedBody)) selectBody(requestedBody);
let previousTime = performance.now();
let orbitVisualTime = 0;
let qualityWindowStart = previousTime;
let qualityFrameTime = 0;
let qualityFrameCount = 0;
let fastWindows = 0;
let animationFrame = 0;
let rendererSuspended = false;
let renderPausedAt = 0;
let pageInactive = false;
let navigationActive = false;
let graphicsInterrupted = false;
function requestSceneFrame() {
  if (!animationFrame && !rendererSuspended) animationFrame = requestAnimationFrame(animate);
}
function syncSceneActivity() {
  const shouldSuspend = filmActive || document.hidden || pageInactive || navigationActive || graphicsInterrupted;
  if (shouldSuspend) viewLoading.pause(); else viewLoading.resume();
  controls.enabled = !filmActive;
  document.body.dataset.filmActive = String(filmActive);
  const dashboard = document.querySelector('.planet-dashboard');
  if (dashboard) dashboard.inert = filmActive;
  else for (const element of [sceneHost, labelHost, $('.topbar'), $('main'), $('.toolbar')]) { if (element) element.inert = filmActive; }
  if (shouldSuspend === rendererSuspended) return;
  const now = performance.now();
  rendererSuspended = shouldSuspend;
  if (shouldSuspend) {
    renderPausedAt = now;
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    pointerStart = null;
    touchPointers.clear();
    pinchDistance = 0;
    hideGestureHint();
  } else {
    if (flight) flight.start += now - renderPausedAt;
    previousTime = now;
    qualityWindowStart = now;
    qualityFrameTime = 0;
    qualityFrameCount = 0;
    requestSceneFrame();
  }
}
window.addEventListener('relic-film-state', event => {
  filmActive = event.detail?.active === true;
  window.__relicFilmActive = filmActive;
  syncSceneActivity();
});
renderer.domElement.addEventListener('webglcontextlost', event => {
  event.preventDefault();
  graphicsInterrupted = true;
  viewLoading.fail('interrupted');
  syncSceneActivity();
});
document.addEventListener('visibilitychange', syncSceneActivity);
window.addEventListener('relic-navigation-state', event => { navigationActive = event.detail?.active === true; syncSceneActivity(); });
window.addEventListener('pagehide', event => {
  pageInactive = true;
  syncSceneActivity();
  if (!event.persisted) { viewLoading.dispose(); controls.dispose(); renderer.dispose(); }
});
window.addEventListener('pageshow', () => { pageInactive = false; navigationActive = false; syncSceneActivity(); });
function animate(time) {
  animationFrame = 0;
  if (rendererSuspended) return;
  requestSceneFrame();
  const dt = Math.min((time - previousTime) / 1000, .05); previousTime = time;
  if (document.hidden) {
    qualityWindowStart = time; qualityFrameTime = 0; qualityFrameCount = 0;
    return;
  }
  if (dt > 0 && dt < .08) { qualityFrameTime += dt; qualityFrameCount++; }
  if (time - qualityWindowStart >= 2400) {
    const averageFrame = qualityFrameCount ? qualityFrameTime / qualityFrameCount : 0;
    const preferred = preferredPixelRatio();
    let nextRatio = renderPixelRatio;
    if (document.documentElement.dataset.quality === 'high') nextRatio = preferred;
    else if (averageFrame > .024) { nextRatio = Math.max(.75, renderPixelRatio - .12); fastWindows = 0; }
    else if (averageFrame > 0 && averageFrame < .018 && renderPixelRatio < preferred) {
      if (++fastWindows >= 2) { nextRatio = Math.min(preferred, renderPixelRatio + .1); fastWindows = 0; }
    } else fastWindows = 0;
    if (Math.abs(nextRatio - renderPixelRatio) > .001) {
      renderPixelRatio = nextRatio;
      renderer.setPixelRatio(renderPixelRatio);
      renderer.setSize(viewportSize().width, viewportSize().height, false);
    }
    qualityWindowStart = time; qualityFrameTime = 0; qualityFrameCount = 0;
  }
  if (selected === 'overview') {
    const reducedMotion = document.documentElement.dataset.motion === 'reduced' || (!document.documentElement.dataset.motion && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (!reducedMotion) orbitVisualTime += dt;
    for (const line of orbitLines.values()) line.material.uniforms.elapsed.value = orbitVisualTime;
    simulationDays += dt / 86400;
    updatePositions(simulationDays);
    sun.rotation.y += dt * .052;
    solarCorona.rotation.y -= dt * .012;
    for (const planet of planets) planetMeshes.get(planet.id).rotation.y += dt * (planet.spin < 0 ? -.07 : .07);
    moon.rotation.y += dt * .045;
  }
  if (selected !== 'overview' && trackedPosition) {
    const current = worldPosition(selected);
    const shift = current.clone().sub(trackedPosition);
    camera.position.add(shift); controls.target.add(shift);
    if (flight) { flight.fromPosition.add(shift); flight.fromTarget.add(shift); flight.toPosition.add(shift); flight.toTarget.add(shift); }
    trackedPosition.copy(current);
  }
  if (flight) {
    const progress = Math.min((time - flight.start) / flight.duration, 1);
    const eased = progress * progress * (3 - 2 * progress);
    camera.position.lerpVectors(flight.fromPosition, flight.toPosition, eased);
    controls.target.lerpVectors(flight.fromTarget, flight.toTarget, eased);
    if (progress === 1) flight = null;
  }
  if (selected !== 'overview') {
    const radius = bodyData(selected).size;
    const altitudeRatio = Math.max(0, camera.position.distanceTo(controls.target) / radius - 1);
    controls.rotateSpeed = THREE.MathUtils.clamp(altitudeRatio * .12, .00000005, .55);
  } else controls.rotateSpeed = .5;
  controls.update();
  for (const planet of planets) {
    const atmosphere = planetGroups.get(planet.id).userData.atmosphere;
    if (atmosphere) atmosphere.visible = selected !== planet.id || camera.position.distanceTo(planetGroups.get(planet.id).position) > planet.size * 1.08;
  }
  const surfaceMesh = selected === 'moon' ? moon : planetMeshes.get(selected);
  if (!flight && time >= surfaceSettleUntil) surfaceDetail.update(time, selected, surfaceMesh, bodyData(selected)?.size);
  positionLabels();
  renderer.render(scene, camera);
  viewLoading.ready();
}
syncSceneActivity();
requestSceneFrame();
