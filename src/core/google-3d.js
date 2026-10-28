import * as Cesium from '../../vendor/cesium/index.js';
Cesium.Ion.defaultAccessToken = ''; // RELIC uses only a user-supplied token for optional ion assets.
import { getCesiumToken, setCesiumToken, validateCesiumToken, API_KEYS_CHANGED_EVENT } from './api-config.js';
import { openApiSettings } from '../ui/api-settings.js';

const GOOGLE_ASSET_ID = 2275207;

export function createGoogle3D(viewer, onState = () => {}) {
  let tileset = null;
  let loadedToken = '';
  let active = false;
  let serial = 0;
  let status = 'off';

  function emit(next, error = '') {
    status = next;
    onState({ status:next, error, active });
  }

  async function enable(token) {
    const request = ++serial;
    token = (token ?? getCesiumToken()).trim();
    if (!token) { emit('missing'); return false; }
    if (validateCesiumToken(token)) { emit('error', 'Enter a complete Cesium ion browser token in API settings.'); return false; }
    if (tileset && token === loadedToken) {
      tileset.show = true;
      viewer.scene.globe.show = false;
      active = true;
      viewer.scene.requestRender();
      emit('ready');
      return true;
    }
    if (tileset) tileset.show = false;
    viewer.scene.globe.show = true;
    active = false;
    emit('loading');
    try {
      // Cesium ion brokers Google's 3D Tiles under the user's own plan and quota.
      const resource = await Cesium.IonResource.fromAssetId(GOOGLE_ASSET_ID, { accessToken:token });
      const compact = globalThis.matchMedia?.('(pointer: coarse)').matches || (globalThis.navigator?.deviceMemory ?? 8) <= 4;
      const next = await Cesium.Cesium3DTileset.fromUrl(resource, {
        showCreditsOnScreen:true,
        maximumScreenSpaceError:compact ? 24 : 16,
        cacheBytes:(compact ? 96 : 384) * 1024 * 1024,
        maximumCacheOverflowBytes:(compact ? 32 : 128) * 1024 * 1024,
        enableCollision:true,
      });
      if (request !== serial) { next.destroy(); return false; }
      if (tileset) viewer.scene.primitives.remove(tileset);
      tileset = viewer.scene.primitives.add(next);
      loadedToken = token;
      setCesiumToken(token);
      tileset.tileFailed?.addEventListener(() => {
        // Provider error objects may contain request URLs with access tokens.
        console.warn('A Google 3D tile is unavailable.');
      });
      viewer.scene.globe.show = false;
      active = true;
      viewer.scene.requestRender();
      emit('ready');
      return true;
    } catch {
      if (request !== serial) return false;
      console.warn('Google 3D is unavailable. Check the browser token permissions, allowed URLs and provider quota.');
      if (tileset) tileset.show = false;
      viewer.scene.globe.show = true;
      active = false;
      emit('error', 'Google 3D is unavailable. Check API settings and your provider account.');
      return false;
    }
  }

  function disable() {
    serial++;
    if (tileset) tileset.show = false;
    viewer.scene.globe.show = true;
    active = false;
    viewer.scene.requestRender();
    emit('off');
  }

  function credentialsChanged() {
    if (!loadedToken || loadedToken === getCesiumToken()) return;
    serial++;
    if (tileset) viewer.scene.primitives.remove(tileset);
    tileset = null; loadedToken = ''; active = false;
    viewer.scene.globe.show = true;
    viewer.scene.requestRender();
    emit(getCesiumToken() ? 'off' : 'missing');
  }
  globalThis.addEventListener?.(API_KEYS_CHANGED_EVENT, credentialsChanged);
  function destroy() {
    disable();
    globalThis.removeEventListener?.(API_KEYS_CHANGED_EVENT, credentialsChanged);
    if (tileset) viewer.scene.primitives.remove(tileset);
    tileset = null; loadedToken = '';
  }
  return { enable, disable, destroy, get active() { return active; }, get status() { return status; }, hasToken:() => Boolean(getCesiumToken()) };
}

export function askForCesiumToken() {
  return openApiSettings({ purpose: 'google3d' });
}
