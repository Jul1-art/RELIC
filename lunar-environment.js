/**
 * Conceptual south-polar lunar landscape for the base simulation.
 * Coordinates are local metres (Y up), not a measured Apollo or Artemis site.
 * NASA reference for the low polar Sun, regolith and deep shadows:
 * https://www.nasa.gov/reference/moonbase-environment/
 */

const TAU = Math.PI * 2;
const CRATERS = [
  [-62, -45, 19, 3.4], [55, -58, 23, 4.8], [-72, 56, 28, 5.3],
  [71, 38, 17, 3.0], [3, -77, 13, 2.3], [-22, 67, 9, 1.3],
  [104, -12, 35, 6.6], [-115, -18, 32, 5.2], [31, 93, 22, 3.5],
  [-42, -105, 25, 4.2], [17, 51, 5, .8], [-54, 14, 5.5, .8],
  [45, -35, 4.5, .65], [-8, -48, 6.5, 1.0]
];
// Prepared footprints match the built solar mounts and the 8.4 m landing pad.
const SOLAR_FOUNDATIONS = [[-24, -11], [25, -17]];
// Keep the route aligned with the rover simulation: its chassis stays at Y=0.
const ROVER_ROUTE = [
  [12, 15], [12, 33], [43, 33], [43, 8],
  [20, 8], [20, 12], [12, 12], [12, 15]
];

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
function hash(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smoothstep(0, 1, x - ix), fz = smoothstep(0, 1, z - iz);
  const a = hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx;
  const b = hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx;
  return (a * (1 - fz) + b * fz) * 2 - 1;
}
function fractal(x, z, octaves = 4) {
  let value = 0, amplitude = 1, total = 0;
  for (let i = 0; i < octaves; i++) {
    value += noise(x, z) * amplitude;
    total += amplitude;
    x *= 2.07; z *= 2.07; amplitude *= .53;
  }
  return value / total;
}
function distanceToSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function naturalTerrainWeight(x, z) {
  // The main apron is level; smaller prepared surfaces are feathered into
  // untouched relief instead of flattening the whole construction site.
  let weight = smoothstep(29, 44, Math.hypot(x, z));
  weight = Math.min(weight, smoothstep(8.9, 13.5, Math.hypot(x - 30, z - 21)));
  for (const [cx, cz] of SOLAR_FOUNDATIONS) {
    const dx = Math.max(Math.abs(x - cx) - 6.7, 0);
    const dz = Math.max(Math.abs(z - cz) - 4.5, 0);
    weight = Math.min(weight, smoothstep(.15, 4.2, Math.hypot(dx, dz)));
  }
  for (let i = 1; i < ROVER_ROUTE.length; i++) {
    const distance = distanceToSegment(x, z, ROVER_ROUTE[i - 1], ROVER_ROUTE[i]);
    weight = Math.min(weight, smoothstep(1.6, 4.6, distance));
  }
  return weight;
}
function terrainHeight(x, z) {
  const natural = naturalTerrainWeight(x, z);
  let height = 3.5 * fractal(x * .012, z * .012, 5)
    + .85 * fractal(x * .068, z * .068, 4)
    + .12 * fractal(x * .38, z * .38, 3);
  for (const [cx, cz, r, depth] of CRATERS) {
    const d = Math.hypot(x - cx, z - cz) / r;
    if (d > 1.85) continue;
    const bowl = d < 1 ? -depth * (1 - d * d) ** 2 : 0;
    const rim = depth * .23 * Math.exp(-(((d - 1.035) / .155) ** 2));
    const ejecta = depth * .045 * Math.exp(-(((d - 1.32) / .28) ** 2));
    height += bowl + rim + ejecta;
  }
  return height * natural;
}
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function makeRegolithTexture(THREE) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const pixels = ctx.createImageData(size, size);
  // Wrapped value noise prevents a visible seam when the fine regolith repeats.
  function periodic(x, y, period) {
    const gx = x / size * period, gy = y / size * period;
    const ix = Math.floor(gx), iy = Math.floor(gy);
    const tx = smoothstep(0, 1, gx - ix), ty = smoothstep(0, 1, gy - iy);
    const sample = (dx, dy) => hash((ix + dx) % period, (iy + dy) % period);
    return ((sample(0, 0) * (1 - tx) + sample(1, 0) * tx) * (1 - ty)
      + (sample(0, 1) * (1 - tx) + sample(1, 1) * tx) * ty) * 2 - 1;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = hash(x + 7907, y + 131);
    const mottling = periodic(x, y, 7) * 10 + periodic(x, y, 29) * 8
      + periodic(x, y, 71) * 5;
    const fleck = grain > .993 ? 24 : grain < .012 ? -23 : 0;
    const value = clamp(175 + mottling + (grain - .5) * 16 + fleck, 90, 216);
    const index = (y * size + x) * 4;
    pixels.data[index] = value;
    pixels.data[index + 1] = value * .982;
    pixels.data[index + 2] = value * .956;
    pixels.data[index + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addWorldUV(THREE, geometry) {
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / 7.5;
    uv[i * 2 + 1] = position.getZ(i) / 7.5;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
function applyTerrainColor(THREE, geometry) {
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const variation = .79 + fractal(x * .024, z * .024, 3) * .16
      + fractal(x * .19, z * .19, 2) * .045;
    colors[i * 3] = variation;
    colors[i * 3 + 1] = variation * .986;
    colors[i * 3 + 2] = variation * .971;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}
function makeNearTerrain(THREE) {
  const geo = new THREE.PlaneGeometry(260, 260, 224, 224);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  pos.needsUpdate = true;
  addWorldUV(THREE, geo);
  applyTerrainColor(THREE, geo);
  geo.computeVertexNormals();
  return geo;
}
function makeFarTerrain(THREE) {
  const rings = 14, sectors = 128;
  const positions = [], uvs = [], colors = [], indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const radius = 95 + (ring / rings) ** 1.35 * 440;
    for (let sector = 0; sector <= sectors; sector++) {
      const angle = sector / sectors * TAU;
      const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
      positions.push(x, terrainHeight(x, z) - .18, z);
      uvs.push(x / 7.5, z / 7.5);
      const variation = .77 + fractal(x * .024, z * .024, 3) * .15;
      colors.push(variation, variation * .986, variation * .971);
    }
  }
  for (let ring = 0; ring < rings; ring++) for (let sector = 0; sector < sectors; sector++) {
    const a = ring * (sectors + 1) + sector;
    const b = a + sectors + 1;
    indices.push(a, b + 1, b, a, a + 1, b + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function addRocks(THREE, group, quality) {
  const random = seededRandom(99117);
  const count = quality === 'low' ? 1000 : 3000;
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const material = new THREE.MeshStandardMaterial({ color: 0x8b8982, roughness: 1, flatShading: true });
  const rocks = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    let x, z;
    do {
      x = (random() - .5) * 255;
      z = (random() - .5) * 255;
    } while (Math.hypot(x, z) < 31 && random() < .96);
    const scale = .035 + random() ** 5 * .45;
    dummy.position.set(x, terrainHeight(x, z) + scale * .19, z);
    dummy.rotation.set(random() * .8, random() * TAU, random() * .8);
    dummy.scale.set(scale * (.7 + random()), scale * (.25 + random() * .43), scale * (.7 + random()));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    color.setScalar(.65 + random() * .5);
    rocks.setColorAt(i, color);
  }
  rocks.instanceMatrix.needsUpdate = true;
  rocks.instanceColor.needsUpdate = true;
  rocks.castShadow = false;
  rocks.receiveShadow = true;
  rocks.frustumCulled = false;
  group.add(rocks);

  const largeCount = quality === 'low' ? 32 : 96;
  const large = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x787872, roughness: 1, flatShading: true }),
    largeCount
  );
  for (let i = 0; i < largeCount; i++) {
    let x, z;
    do { x = (random() - .5) * 255; z = (random() - .5) * 255; }
    while (Math.hypot(x, z) < 45);
    const scale = .55 + random() ** 2 * 1.85;
    dummy.position.set(x, terrainHeight(x, z) + scale * .16, z);
    dummy.rotation.set(random() * .5, random() * TAU, random() * .5);
    dummy.scale.set(scale * (.75 + random() * .7), scale * (.28 + random() * .32), scale);
    dummy.updateMatrix();
    large.setMatrixAt(i, dummy.matrix);
    color.setScalar(.7 + random() * .4);
    large.setColorAt(i, color);
  }
  large.instanceMatrix.needsUpdate = true;
  large.instanceColor.needsUpdate = true;
  large.castShadow = true;
  large.receiveShadow = true;
  large.frustumCulled = false;
  group.add(large);
}

function addStars(THREE, group, quality) {
  const random = seededRandom(55188);
  const count = quality === 'low' ? 420 : 1150;
  const points = [];
  for (let i = 0; i < count; i++) {
    const az = random() * TAU;
    const altitude = .045 + random() * 1.42;
    const r = 385;
    points.push(Math.cos(az) * Math.cos(altitude) * r,
      Math.sin(altitude) * r,
      Math.sin(az) * Math.cos(altitude) * r);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.PointsMaterial({ color: 0xd9e4f3, size: .9, sizeAttenuation: false,
    transparent: true, opacity: .24, depthWrite: false, toneMapped: false });
  const stars = new THREE.Points(geometry, material);
  group.add(stars);
  return stars;
}

/**
 * Build a reusable lunar environment around a locally levelled 29 m apron.
 * `sunElevationRadians` is preferred. `sunElevation` and `sunAzimuth` are degrees.
 * Call `update({ sunElevationRadians, sunAzimuthRadians, dt })` each frame, with dt
 * in seconds, for smooth transitions. `getHeightAt(x,z)` returns metres.
 */
export function buildLunarEnvironment(scene, THREE, options = {}) {
  const group = new THREE.Group();
  group.name = 'Conceptual south-polar lunar environment';
  scene.add(group);
  const previousBackground = scene.background;
  const background = new THREE.Color(0x020306);
  scene.background = background;

  const texture = makeRegolithTexture(THREE);
  const surfaceMaterial = new THREE.MeshStandardMaterial({ map: texture, bumpMap: texture,
    bumpScale: .055, vertexColors: true, roughness: 1, metalness: 0 });
  const near = new THREE.Mesh(makeNearTerrain(THREE), surfaceMaterial);
  near.name = 'Levelled regolith and local craters';
  near.receiveShadow = true;
  near.castShadow = false;
  group.add(near);
  const far = new THREE.Mesh(makeFarTerrain(THREE), surfaceMaterial);
  far.name = 'Distant cratered horizon';
  far.receiveShadow = true;
  far.castShadow = false;
  group.add(far);
  addRocks(THREE, group, options.quality);
  const stars = addStars(THREE, group, options.quality);

  // At a conceptual south-polar site, Earth is kept low over the horizon.
  const earth = new THREE.Mesh(new THREE.SphereGeometry(2.75, 40, 28),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1,
      emissive: 0x1a2537, emissiveIntensity: .14 }));
  earth.name = 'Earth, NASA Blue Marble texture';
  earth.position.set(-75, 22, -144);
  earth.rotation.y = -.55;
  group.add(earth);
  let disposed = false;
  const earthTexture = new THREE.TextureLoader().load(
    new URL('./assets/earth-blue-marble-4k.webp', import.meta.url).href,
    loaded => {
      if (disposed) { loaded.dispose(); return; }
      loaded.colorSpace = THREE.SRGBColorSpace;
      earth.material.map = loaded;
      earth.material.needsUpdate = true;
    }
  );
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(2.81, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x91b7e7, transparent: true, opacity: .095,
      side: THREE.BackSide, depthWrite: false, toneMapped: false }));
  atmosphere.position.copy(earth.position);
  group.add(atmosphere);

  const sun = new THREE.DirectionalLight(0xfff8eb, 3.0);
  sun.name = 'Unscattered polar sunlight';
  sun.castShadow = true;
  sun.shadow.mapSize.set(options.quality === 'low' ? 1024 : 2048,
    options.quality === 'low' ? 1024 : 2048);
  sun.shadow.camera.left = -110;
  sun.shadow.camera.right = 110;
  sun.shadow.camera.top = 110;
  sun.shadow.camera.bottom = -110;
  sun.shadow.camera.near = .5;
  sun.shadow.camera.far = 270;
  sun.shadow.bias = -.00018;
  sun.shadow.normalBias = .018;
  sun.target.position.set(0, 0, 0);
  group.add(sun, sun.target);
  // The Sun has no atmospheric fill on the Moon. These low-energy lights
  // approximate Earthshine and regolith / nearby-structure interreflection.
  const earthshine = new THREE.DirectionalLight(0xaabbd2, .12);
  earthshine.name = 'Approximate Earthshine and regolith bounce';
  earthshine.position.copy(earth.position).normalize().multiplyScalar(120);
  group.add(earthshine, earthshine.target);
  const regolithBounce = new THREE.DirectionalLight(0xaaa49a, .5);
  regolithBounce.name = 'Approximate reflected light from the foreground regolith';
  regolithBounce.position.set(62, 28, 91);
  group.add(regolithBounce, regolithBounce.target);
  const bounce = new THREE.AmbientLight(0x777d85, .055);
  group.add(bounce);
  const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff9ec, toneMapped: false }));
  group.add(sunDisk);

  let elevation = options.sunElevationRadians ?? (options.sunElevation != null
    ? options.sunElevation * Math.PI / 180 : .105);
  let azimuth = options.sunAzimuthRadians ?? (options.sunAzimuth != null
    ? options.sunAzimuth * Math.PI / 180 : -1.0);
  let targetElevation = elevation, targetAzimuth = azimuth;
  function update({ sunElevationRadians, sunElevation, sunAzimuthRadians, sunAzimuth, dt } = {}) {
    if (disposed) return;
    if (Number.isFinite(sunElevationRadians)) targetElevation = sunElevationRadians;
    else if (Number.isFinite(sunElevation)) targetElevation = sunElevation * Math.PI / 180;
    if (Number.isFinite(sunAzimuthRadians)) targetAzimuth = sunAzimuthRadians;
    else if (Number.isFinite(sunAzimuth)) targetAzimuth = sunAzimuth * Math.PI / 180;
    if (Number.isFinite(dt) && dt > 0) {
      const factor = 1 - Math.exp(-Math.min(dt, .1) * 1.9);
      elevation += (targetElevation - elevation) * factor;
      azimuth += Math.atan2(Math.sin(targetAzimuth - azimuth), Math.cos(targetAzimuth - azimuth)) * factor;
    } else { elevation = targetElevation; azimuth = targetAzimuth; }
    const direction = new THREE.Vector3(Math.cos(azimuth) * Math.cos(elevation),
      Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation));
    sun.position.copy(direction).multiplyScalar(120);
    sunDisk.position.copy(direction).multiplyScalar(345);
    const daylight = smoothstep(-.01, .085, elevation);
    sun.intensity = 3.0 * daylight;
    sun.castShadow = daylight > .015;
    sunDisk.visible = elevation > 0;
    earthshine.intensity = .13 + (1 - daylight) * .09;
    regolithBounce.intensity = .11 + daylight * .39;
    bounce.intensity = .035 + daylight * .02;
    stars.material.opacity = .72 - daylight * .5;
    earth.rotation.y += Math.min(Math.max(dt || 0, 0), .1) * .0015;
  }
  update();

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.traverse(object => {
      object.geometry?.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    texture.dispose();
    earthTexture.dispose();
    sun.shadow.dispose();
    scene.remove(group);
    if (scene.background === background) scene.background = previousBackground;
  }
  return { update, getHeightAt: terrainHeight, dispose,
    lights: { sun, earthshine, regolithBounce, bounce }, group, earth, terrain: near };
}
