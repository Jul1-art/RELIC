import * as Cesium from './vendor/cesium/index.js';

const SAMPLES = 65 * 65;

export function createMeasuredTerrain(body, ellipsoid, onStatus = () => {}) {
  const scheme = new Cesium.GeographicTilingScheme({ ellipsoid, numberOfLevelZeroTilesX:2, numberOfLevelZeroTilesY:1 });
  let failed = false;
  return new Cesium.CustomHeightmapTerrainProvider({
    width:65,
    height:65,
    tilingScheme:scheme,
    callback:async (x, y, level) => {
      try {
        const url = new URL(`./api/height/${body}/${level}/${x}/${y}.bin?v=4`, document.baseURI);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== SAMPLES * 4) throw new Error('Incomplete elevation tile');
        const heights = new Float32Array(buffer);
        if (failed) { failed = false; onStatus(true); }
        return heights;
      } catch (error) {
        if (!failed) { failed = true; onStatus(false, error); }
        return new Float32Array(SAMPLES);
      }
    },
  });
}
