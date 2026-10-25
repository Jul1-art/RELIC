import * as THREE from 'three';

const SOURCES = {
  earth: {
    scheme: 'mercator', maxLevel: 8,
    url: (z, x, y) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${z}/${y}/${x}.jpeg`,
  },
  mars: {
    scheme: 'geographic', maxLevel: 7,
    url: (z, x, y) => `https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
  },
  moon: {
    scheme: 'geographic', maxLevel: 8,
    url: (z, x, y) => `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
  },
};

const LOCAL_SOURCES = {
  mars: {
    scheme:'geographic', maxLevel:17, bounds:[77.2229331,18.3067994,77.583964,18.669315],
    url:(z,x,y) => `https://trek.nasa.gov/tiles/Mars/EQ/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
  },
  moon: {
    scheme:'geographic', maxLevel:15, bounds:[23.4484963,.1464532,23.5396925,1.1149077],
    url:(z,x,y) => `https://trek.nasa.gov/tiles/Moon/EQ/apollo11_26cm_mosaic_byte_geo_1_2_highContrast/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
  },
};

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

function matrix(source, level) {
  return source.scheme === 'mercator'
    ? { columns:2 ** level, rows:2 ** level }
    : { columns:2 ** (level + 1), rows:2 ** level };
}

function tileGeometry(source, radius, level, x, y) {
  const { columns, rows } = matrix(source, level);
  const divisions = level < 5 ? 26 : 16;
  const positions = [], uvs = [], indices = [];
  for (let row = 0; row <= divisions; row++) {
    const tileV = row / divisions;
    const globalV = (y + tileV) / rows;
    const latitude = source.scheme === 'mercator'
      ? Math.atan(Math.sinh(Math.PI * (1 - 2 * globalV)))
      : Math.PI * (.5 - globalV);
    const cosLat = Math.cos(latitude), sinLat = Math.sin(latitude);
    for (let col = 0; col <= divisions; col++) {
      const tileU = col / divisions;
      const longitude = TAU * ((x + tileU) / columns);
      positions.push(-radius * cosLat * Math.cos(longitude), radius * sinLat, radius * cosLat * Math.sin(longitude));
      uvs.push(tileU, 1 - tileV);
    }
  }
  for (let row = 0; row < divisions; row++) for (let col = 0; col < divisions; col++) {
    const a = row * (divisions + 1) + col, b = a + 1, c = a + divisions + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class SurfaceDetail {
  constructor(camera, renderer, onState) {
    this.camera = camera;
    this.renderer = renderer;
    this.onState = onState;
    this.loader = new THREE.TextureLoader().setCrossOrigin('anonymous');
    this.cache = new Map();
    this.tiles = [];
    this.signature = '';
    this.generation = 0;
    this.lastCheck = 0;
    this.activeBody = null;
  }

  disposeTiles(tiles) {
    for (const tile of tiles) {
      tile.parent?.remove(tile);
      tile.geometry.dispose();
      tile.material.dispose();
    }
  }

  clear() {
    this.generation++;
    this.disposeTiles(this.tiles);
    this.tiles = [];
    this.signature = '';
    this.activeBody = null;
    this.onState(null);
  }

  load(key, url) {
    let entry = this.cache.get(key);
    if (!entry) {
      entry = { texture:null, used:performance.now() };
      entry.promise = this.loader.loadAsync(url).then(texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        entry.texture = texture;
        return texture;
      }).catch(error => {
        this.cache.delete(key);
        throw error;
      });
      this.cache.set(key, entry);
    }
    entry.used = performance.now();
    return entry.promise;
  }

  trimCache() {
    if (this.cache.size <= 150) return;
    const visible = new Set(this.tiles.map(tile => tile.userData.tileKey));
    const entries = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [key, entry] of entries) {
      if (this.cache.size <= 120) break;
      if (!entry.texture || visible.has(key)) continue;
      entry.texture.dispose();
      this.cache.delete(key);
    }
  }

  update(now, id, mesh, radius) {
    let source = SOURCES[id];
    if (!source || !mesh || !radius) {
      if (this.signature) this.clear();
      return;
    }
    if (now - this.lastCheck < 260) return;
    this.lastCheck = now;
    mesh.updateWorldMatrix(true, false);
    const center = mesh.getWorldPosition(new THREE.Vector3());
    const distance = this.camera.position.distanceTo(center);
    const altitudeRatio = Math.max((distance - radius) / radius, .000005);
    if (altitudeRatio > 1.05) {
      if (this.signature) this.clear();
      return;
    }

    const facing = mesh.worldToLocal(this.camera.position.clone()).normalize();
    const u = ((Math.atan2(facing.z, -facing.x) / TAU) % 1 + 1) % 1;
    const latitude = Math.asin(clamp(facing.y, -1, 1));
    const longitude = u * 360 - 180;
    const latitudeDegrees = THREE.MathUtils.radToDeg(latitude);
    const local = LOCAL_SOURCES[id];
    if (local && altitudeRatio < .025 && longitude >= local.bounds[0] && longitude <= local.bounds[2] && latitudeDegrees >= local.bounds[1] && latitudeDegrees <= local.bounds[3]) source = local;
    const level = clamp(Math.floor(4.5 - Math.log2(altitudeRatio)), 3, source.maxLevel);
    const { columns, rows } = matrix(source, level);
    const v = source.scheme === 'mercator'
      ? (1 - Math.log(Math.tan(Math.PI / 4 + clamp(latitude, -1.4835, 1.4835) / 2)) / Math.PI) / 2
      : .5 - latitude / Math.PI;
    const centerX = Math.floor(u * columns);
    const centerY = clamp(Math.floor(v * rows), 0, rows - 1);
    const sourceId = source === local ? `${id}-local` : id;
    const tileSpan = Math.PI * radius / rows * Math.max(.3, Math.cos(latitude));
    const halfView = Math.max(0, distance - radius) * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * Math.max(1, this.camera.aspect);
    const reach = clamp(Math.ceil(halfView / tileSpan), 1, 3);
    const signature = `${sourceId}/${level}/${centerX}/${centerY}/${reach}`;
    if (signature === this.signature) return;

    this.generation++;
    const generation = this.generation;
    const oldTiles = this.tiles;
    let swapped = false;
    this.signature = signature;
    this.activeBody = id;
    const coords = [];
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
      const y = centerY + dy;
      if (y < 0 || y >= rows) continue;
      const x = (centerX + dx + columns) % columns;
      if (source.bounds) {
        const west = x / columns * 360 - 180, east = (x + 1) / columns * 360 - 180;
        const north = 90 - y / rows * 180, south = 90 - (y + 1) / rows * 180;
        if (east < source.bounds[0] || west > source.bounds[2] || north < source.bounds[1] || south > source.bounds[3]) continue;
      }
      coords.push({ x, y, priority:Math.abs(dx) + Math.abs(dy) });
    }
    coords.sort((a, b) => a.priority - b.priority);
    const wanted = new Set(coords.map(({ x, y }) => `${sourceId}/${level}/${x}/${y}`));
    const retained = oldTiles.filter(tile => wanted.has(tile.userData.tileKey));
    const retainedKeys = new Set(retained.map(tile => tile.userData.tileKey));
    const missing = coords.filter(({ x, y }) => !retainedKeys.has(`${sourceId}/${level}/${x}/${y}`));
    if (!missing.length) {
      this.disposeTiles(oldTiles.filter(tile => !wanted.has(tile.userData.tileKey)));
      this.tiles = retained;
      this.onState({ id, level, local:source === local, loading:false });
      return;
    }
    this.onState({ id, level, local:source === local, loading:true });
    for (const { x, y } of missing) {
      const key = `${sourceId}/${level}/${x}/${y}`;
      this.load(key, source.url(level, x, y)).then(texture => {
        if (generation !== this.generation) return;
        if (!swapped) {
          this.disposeTiles(oldTiles.filter(tile => !wanted.has(tile.userData.tileKey)));
          this.tiles = retained;
          swapped = true;
          this.onState({ id, level, local:source === local, loading:false });
        }
        const material = new THREE.MeshStandardMaterial({
          map:texture, emissive:0xffffff, emissiveMap:texture, emissiveIntensity:.12,
          roughness:1, metalness:0, alphaTest:source.bounds ? .01 : 0,
          polygonOffset:true, polygonOffsetFactor:-2,
        });
        const tile = new THREE.Mesh(tileGeometry(source, radius * 1.00000008, level, x, y), material);
        tile.userData.tileKey = key;
        tile.frustumCulled = true;
        mesh.add(tile);
        this.tiles.push(tile);
      }).catch(error => {
        if (generation === this.generation && !swapped && missing[0].x === x && missing[0].y === y) this.onState({ id, level, loading:false, unavailable:true });
        console.warn('Tuile de surface indisponible :', key, error);
      });
    }
    this.trimCache();
  }
}
