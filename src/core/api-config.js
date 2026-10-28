/** Browser-scoped credentials. No credentials are embedded or read from a server. */
export const CESIUM_TOKEN_STORAGE_KEY = 'relic.api.cesium-ion';
export const LEGACY_CESIUM_TOKEN_STORAGE_KEY = 'nasa-atlas-cesium-ion-token';
export const API_KEYS_CHANGED_EVENT = 'relic-api-keys-change';

let temporaryToken;

function storage() {
  try { return globalThis.localStorage ?? null; }
  catch { return null; }
}

export function validateCesiumToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (!token) return 'empty';
  if (token.length > 8192) return 'format';
  // Cesium ion issues JWT access tokens. Only validate their shape locally;
  // Cesium checks the signature, permissions and allowed URLs when activated.
  if (token.length < 20 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return 'format';
  return '';
}

function notify() {
  if (typeof globalThis.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
    globalThis.dispatchEvent(new CustomEvent(API_KEYS_CHANGED_EVENT, {
      detail: { cesiumConfigured: Boolean(getCesiumToken()) },
    }));
  }
}

export function getCesiumToken() {
  if (temporaryToken !== undefined) return temporaryToken;
  const local = storage();
  if (!local) return '';
  try {
    const current = (local.getItem(CESIUM_TOKEN_STORAGE_KEY) || '').trim();
    if (current) return validateCesiumToken(current) ? '' : current;
    const previous = (local.getItem(LEGACY_CESIUM_TOKEN_STORAGE_KEY) || '').trim();
    if (!previous || validateCesiumToken(previous)) return '';
    try {
      local.setItem(CESIUM_TOKEN_STORAGE_KEY, previous);
      local.removeItem(LEGACY_CESIUM_TOKEN_STORAGE_KEY);
    } catch { temporaryToken = previous; }
    return previous;
  } catch { return ''; }
}

export function setCesiumToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (validateCesiumToken(token)) throw new TypeError('Invalid Cesium ion token format.');
  temporaryToken = token;
  let persistent = false;
  const local = storage();
  if (local) {
    try {
      local.setItem(CESIUM_TOKEN_STORAGE_KEY, token);
      local.removeItem(LEGACY_CESIUM_TOKEN_STORAGE_KEY);
      persistent = true;
    } catch { /* Keep the token in this tab and report that saving was blocked. */ }
  }
  notify();
  return { configured: true, persistent };
}

export function clearApiKeys() {
  temporaryToken = '';
  let persistent = true;
  const local = storage();
  if (!local) persistent = false;
  else {
    for (const name of [CESIUM_TOKEN_STORAGE_KEY, LEGACY_CESIUM_TOKEN_STORAGE_KEY]) {
      try { local.removeItem(name); } catch { persistent = false; }
    }
  }
  notify();
  return { configured: false, persistent };
}
