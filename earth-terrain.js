import * as Cesium from './vendor/cesium/index.js';
import { backendFeatureAvailable, markBackendFeatureUnavailable, retryDelay } from './atlas-services.js';

const SAMPLES = 65 * 65;
const states = new Map();
let active = 0;
const queue = [];
async function limited(task) {
  if (active >= 3) await new Promise(resolve => queue.push(resolve));
  active++;
  try { return await task(); }
  finally { active--; queue.shift()?.(); }
}
function stateFor(body) {
  const key = `${new URL('./', document.baseURI).href}:${body}`;
  if (!states.has(key)) states.set(key, { probe:null, ready:false, cache:new Map(), pending:new Map() });
  return states.get(key);
}

export function createMeasuredTerrain(body, ellipsoid, onStatus = () => {}) {
  const scheme = new Cesium.GeographicTilingScheme({ ellipsoid, numberOfLevelZeroTilesX:2, numberOfLevelZeroTilesY:1 });
  const state = stateFor(body), feature = `height:${body}`;
  let previousStatus;
  function status(available) { if (available !== previousStatus) { previousStatus = available; onStatus(available); } }
  async function read(x,y,level) {
    if (!backendFeatureAvailable(feature)) throw new Error('No terrain backend');
    const key = `${level}/${x}/${y}`;
    if (state.cache.has(key)) return state.cache.get(key);
    if (state.pending.has(key)) return state.pending.get(key);
    const pending = limited(async () => {
      if (!backendFeatureAvailable(feature)) throw new Error('No terrain backend');
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
      try {
        const url = new URL(`./api/height/${body}/${key}.bin?v=4`, document.baseURI);
        const response = await fetch(url, { signal:controller.signal, cache:'force-cache', credentials:'same-origin' });
        if (!response.ok) {
          const cooldown = response.status === 429 ? retryDelay(response.headers.get('Retry-After')) / 1000 : [404,405,410,501].includes(response.status) ? 21600 : 60;
          markBackendFeatureUnavailable(feature, cooldown);
          throw new Error('Terrain source not ready');
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== SAMPLES*4) { markBackendFeatureUnavailable(feature); throw new Error('Invalid terrain tile'); }
        const heights = new Float32Array(buffer);
        if (!heights.every(Number.isFinite)) throw new Error('Invalid terrain heights');
        state.cache.set(key, heights);
        if (state.cache.size > 96) state.cache.delete(state.cache.keys().next().value);
        return heights;
      } finally { clearTimeout(timer); }
    }).finally(() => state.pending.delete(key));
    state.pending.set(key,pending);
    return pending;
  }
  if (!backendFeatureAvailable(feature)) {
    queueMicrotask(() => status(false));
    return new Cesium.EllipsoidTerrainProvider({ tilingScheme:scheme, ellipsoid });
  }
  return new Cesium.CustomHeightmapTerrainProvider({
    width:65, height:65, tilingScheme:scheme,
    callback:async (x,y,level) => {
      try {
        if (!backendFeatureAvailable(feature)) { status(false); return new Float32Array(SAMPLES); }
        if (!state.ready) {
          if (!state.probe) state.probe = read(x,y,level).then(() => { state.ready = true; }).catch(() => { markBackendFeatureUnavailable(feature,60); }).finally(() => { state.probe = null; });
          await state.probe;
          if (!state.ready || !backendFeatureAvailable(feature)) { status(false); return new Float32Array(SAMPLES); }
        }
        const heights = await read(x,y,level);
        status(true); return heights;
      } catch {
        markBackendFeatureUnavailable(feature,60); status(false);
        // This is explicitly reported as an unmeasured flat fallback above.
        return new Float32Array(SAMPLES);
      }
    },
  });
}
