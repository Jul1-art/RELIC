/* Lightweight same-origin navigation. No speculative downloads or app cloning. */
let installed = false;
let navigationTimer;
let active = false;

function reducedMotion() {
  return document.documentElement.dataset.motion === 'reduced'
    || (!document.documentElement.dataset.motion && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function ensureStyles() {
  const href = new URL('./navigation.css', import.meta.url).href;
  if ([...document.querySelectorAll('link[rel=stylesheet]')].some(link => link.href === href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.relicNavigation = '';
  document.head.appendChild(link);
}

function signal(next) {
  if (active === next) return;
  active = next;
  document.documentElement.dataset.relicNavigating = String(next);
  if (next) document.body?.setAttribute('aria-busy', 'true');
  else document.body?.removeAttribute('aria-busy');
  window.dispatchEvent(new CustomEvent('relic-navigation-state', { detail:{ active:next } }));
}

function restore() {
  clearTimeout(navigationTimer);
  signal(false);
  document.documentElement.classList.remove('relic-page-entering');
}

function begin() {
  ensureStyles();
  clearTimeout(navigationTimer);
  signal(true);
  performance.mark?.('relic-navigation-start');
  // A rejected navigation or cancelled unload must never leave the scene inert.
  navigationTimer = setTimeout(restore, 12000);
}

function destination(value) {
  try {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
    if (url.pathname === location.pathname && url.search === location.search) return null;
    if (!/\/(?:index|earth|terrain|base_lun(?:aire|iare)_3d)\.html$/.test(url.pathname)
      && !url.pathname.endsWith('/')) return null;
    return url;
  } catch { return null; }
}

/** Use for planet buttons that navigate rather than move the current camera. */
export function navigateTo(value) {
  const url = destination(value);
  if (!url) return;
  initializeNavigation();
  begin();
  // Native navigation begins immediately; there is no animation timeout before
  // fetching the next page, and browsers can use their back/forward cache.
  location.assign(url.href);
}

export function initializeNavigation() {
  if (installed) return;
  installed = true;
  ensureStyles();
  document.documentElement.dataset.relicNavigating = 'false';
  if (!reducedMotion() && !('onpagereveal' in window)) {
    document.documentElement.classList.add('relic-page-entering');
    setTimeout(() => document.documentElement.classList.remove('relic-page-entering'), 260);
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.hasAttribute('download') || link.target && link.target !== '_self'
      || link.closest('[data-no-navigation]') || !destination(link.href)) return;
    begin();
    // Keep the browser's default anchor behavior and accessibility semantics.
  });
  window.addEventListener('pageshow', restore);
  window.addEventListener('pagehide', () => clearTimeout(navigationTimer));
  window.addEventListener('pagereveal', () => {
    restore();
    if (!reducedMotion()) document.documentElement.classList.add('relic-page-entering');
    setTimeout(() => document.documentElement.classList.remove('relic-page-entering'), 260);
  });
}
