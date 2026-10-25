import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const file = new URL('../api-config.js', import.meta.url);
const source = await readFile(file, 'utf8');
const fixtureToken = 'exampleHeader.examplePayload.exampleSignature';

async function config(initial = {}, overrides = {}) {
  const values = new Map(Object.entries(initial));
  const calls = [];
  const context = vm.createContext({
    localStorage: {
      getItem: name => values.get(name) ?? null,
      setItem: (name, value) => { values.set(name, value); },
      removeItem: name => values.delete(name),
      ...overrides,
    },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent: event => calls.push(event),
  });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => { throw new Error('API config must have no network or other dependencies.'); });
  await module.evaluate();
  return { api: module.namespace, values, calls };
}

test('no key is configured until the user supplies one, and invalid inputs never persist', async () => {
  const { api, values } = await config();
  assert.equal(api.getCesiumToken(), '');
  for (const bad of ['', 'password', 'https://ion.cesium.com/tokens', 'header.payload.signature with spaces', 'x'.repeat(9000)]) {
    assert(api.validateCesiumToken(bad));
    assert.throws(() => api.setCesiumToken(bad), /Invalid Cesium ion token format/);
  }
  assert.equal(values.size, 0);
});

test('legacy browser tokens migrate locally without being sent through an event or a network dependency', async () => {
  const legacy = 'nasa-atlas-cesium-ion-token';
  const { api, values, calls } = await config({ [legacy]: fixtureToken });
  assert.equal(api.getCesiumToken(), fixtureToken);
  assert.equal(values.get(api.CESIUM_TOKEN_STORAGE_KEY), fixtureToken);
  assert.equal(values.has(legacy), false);
  assert.equal(calls.length, 0);
  assert.deepEqual(Object.keys(api.setCesiumToken(fixtureToken)).sort(), ['configured', 'persistent']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].detail.cesiumConfigured, true);
  assert(!JSON.stringify(calls).includes(fixtureToken));
});

test('clearing removes both current and legacy credentials and notifies active views without the token', async () => {
  const { api, values, calls } = await config();
  api.setCesiumToken(fixtureToken);
  values.set(api.LEGACY_CESIUM_TOKEN_STORAGE_KEY, fixtureToken);
  const result = api.clearApiKeys();
  assert.equal(result.persistent, true);
  assert.equal(api.getCesiumToken(), '');
  assert.equal(values.size, 0);
  assert.equal(calls.at(-1).detail.cesiumConfigured, false);
  assert(!JSON.stringify(calls).includes(fixtureToken));
});

test('blocked persistent storage is reported honestly while allowing this-tab-only use', async () => {
  const { api, calls } = await config({}, {
    setItem() { throw new Error('Storage blocked'); },
    removeItem() { throw new Error('Storage blocked'); },
  });
  assert.equal(api.setCesiumToken(fixtureToken).persistent, false);
  assert.equal(api.getCesiumToken(), fixtureToken);
  assert.equal(api.clearApiKeys().persistent, false);
  assert.equal(api.getCesiumToken(), '');
  assert.equal(calls.at(-1).detail.cesiumConfigured, false);
});

async function googleView({ rejectProvider = false } = {}) {
  const values = new Map();
  const warnings = [];
  const listeners = new Map();
  const requests = [];
  const context = vm.createContext({
    localStorage: { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) },
    console: { warn: (...args) => warnings.push(args) },
    fetch: () => { throw new Error('Credentials must not be fetched from a shared server.'); },
    CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent: event => { for (const listener of listeners.get(event.type) ?? []) listener(event); },
    addEventListener: (type, listener) => { const list = listeners.get(type) ?? []; list.push(listener); listeners.set(type, list); },
    removeEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? []).filter(item => item !== listener)),
  });
  const settings = new vm.SyntheticModule(['openApiSettings'], function() {
    this.setExport('openApiSettings', async () => fixtureToken);
  }, { context });
  const tiles = { show: true, destroyed: false, destroy() { this.destroyed = true; }, tileFailed: { addEventListener() {} } };
  const ion = { defaultAccessToken: 'upstream-demo-placeholder' };
  const provider = new vm.SyntheticModule(['Ion', 'IonResource', 'Cesium3DTileset'], function() {
    this.setExport('Ion', ion);
    this.setExport('IonResource', { async fromAssetId(id, options) {
      requests.push({ id, options });
      if (rejectProvider) throw new Error('Private provider request https://example.invalid/?access_token=' + fixtureToken);
      return {};
    } });
    this.setExport('Cesium3DTileset', { async fromUrl() { return tiles; } });
  }, { context });
  const local = new vm.SourceTextModule(source, { context });
  await local.link(() => { throw new Error('Unexpected API config import'); });
  await local.evaluate();
  const module = new vm.SourceTextModule(await readFile(new URL('../google-3d.js', import.meta.url), 'utf8'), { context });
  await module.link(name => name === './api-config.js' ? local : name === './api-settings.js' ? settings : provider);
  await module.evaluate();
  const removed = [];
  const viewer = { scene: { globe: { show: true }, primitives: { add: item => item, remove: item => { removed.push(item); item.destroy(); } }, requestRender() {} } };
  const states = [];
  const view = module.namespace.createGoogle3D(viewer, state => states.push(state));
  return { api: local.namespace, view, states, requests, warnings, viewer, removed, tiles, ion };
}

test('Google 3D makes no shared-token request when unconfigured, and strips provider error payloads', async () => {
  const { api, view, states, requests, warnings, ion } = await googleView({ rejectProvider: true });
  assert.equal(ion.defaultAccessToken, '', 'The integration must clear upstream SDK demo credentials.');
  assert.equal(await view.enable(), false);
  assert.equal(view.status, 'missing');
  assert.equal(requests.length, 0);
  api.setCesiumToken(fixtureToken);
  assert.equal(await view.enable(), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.accessToken, fixtureToken, 'Only the user-supplied browser token may activate the keyed provider.');
  assert.equal(ion.defaultAccessToken, '');
  assert.equal(view.status, 'error');
  assert(!JSON.stringify(states).includes(fixtureToken));
  assert(!JSON.stringify(warnings).includes(fixtureToken));
  assert(!JSON.stringify(warnings).includes('example.invalid'));
});

test('removing local keys stops the existing keyed 3D view and returns to the keyless globe', async () => {
  const { api, view, viewer, removed, tiles } = await googleView();
  api.setCesiumToken(fixtureToken);
  assert.equal(await view.enable(), true);
  assert.equal(view.active, true);
  assert.equal(viewer.scene.globe.show, false);
  api.clearApiKeys();
  assert.equal(view.active, false);
  assert.equal(view.status, 'missing');
  assert.equal(viewer.scene.globe.show, true);
  assert.equal(removed.length, 1);
  assert.equal(tiles.destroyed, true);
});
