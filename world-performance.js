/* Shared, bounded render settings for the measured Cesium world views. */
export function configureWorldPerformance(viewer, { onSuspend = () => {}, loading = null, isReady = () => true, onReady = () => {} } = {}) {
  let leaving = false;
  let hiddenPage = false;
  let disposed = false;
  let graphicsFailed = false;
  let removeFirstFrame;
  let removeRenderError;
  let viewportObserver;
  const alive = () => !disposed && !viewer.isDestroyed();

  function quality() {
    if (!alive() || graphicsFailed) return;
    const viewport = viewer.container || viewer.scene.canvas.parentElement;
    const width = Math.max(1, viewport?.clientWidth || innerWidth);
    const height = Math.max(1, viewport?.clientHeight || innerHeight);
    const high = document.documentElement.dataset.quality === 'high';
    const compact = matchMedia('(pointer: coarse)').matches || width <= 760;
    const budget = high ? (compact ? 2400000 : 5500000) : (compact ? 1200000 : 3000000);
    const ratio = Math.min(devicePixelRatio || 1, high ? 2 : compact ? 1.35 : 1.5,
      Math.sqrt(budget / (width * height)));
    viewer.useBrowserRecommendedResolution = true;
    viewer.resolutionScale = Math.max(.75, ratio);
    viewer.targetFrameRate = compact && !high ? 45 : 60;
    viewer.scene.requestRenderMode = true;
    viewer.scene.maximumRenderTimeChange = Infinity;
    viewer.scene.globe.maximumScreenSpaceError = high ? (compact ? 2 : 1.5) : (compact ? 3 : 2);
    viewer.scene.globe.tileCacheSize = high ? 160 : compact ? 64 : 96;
    viewer.scene.requestRender();
  }

  function activity() {
    if (!alive()) return;
    const running = !document.hidden && !leaving && !hiddenPage && !graphicsFailed;
    viewer.useDefaultRenderLoop = running;
    if (!running) { onSuspend(); loading?.pause(); }
    else { loading?.resume(); viewer.resize(); viewer.scene.requestRender(); }
  }
  const navigation = event => { leaving = event.detail?.active === true; activity(); };
  const pagehide = event => {
    hiddenPage = true;
    activity();
    // Retain the existing scene only when the browser can restore it from BFCache.
    if (!event.persisted) { dispose(); if (!viewer.isDestroyed()) viewer.destroy(); }
  };
  const pageshow = () => { hiddenPage = false; leaving = false; activity(); };
  const graphicsError = () => {
    if (disposed || graphicsFailed) return;
    graphicsFailed = true;
    loading?.fail('interrupted');
    activity();
  };
  const contextLost = event => { event.preventDefault(); graphicsError(); };
  function dispose() {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('resize', quality);
    window.removeEventListener('relic-preferences-change', quality);
    window.removeEventListener('relic-navigation-state', navigation);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener('pageshow', pageshow);
    document.removeEventListener('visibilitychange', activity);
    viewer.scene.canvas.removeEventListener('webglcontextlost', contextLost);
    removeFirstFrame?.(); removeRenderError?.();
    loading?.dispose();
    viewportObserver?.disconnect();
  }
  window.addEventListener('resize', quality, { passive:true });
  window.addEventListener('relic-preferences-change', quality);
  window.addEventListener('relic-navigation-state', navigation);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener('pageshow', pageshow);
  document.addEventListener('visibilitychange', activity);
  viewer.scene.canvas.addEventListener('webglcontextlost', contextLost);
  removeRenderError = viewer.scene.renderError?.addEventListener(graphicsError);
  removeFirstFrame = viewer.scene.postRender.addEventListener(function firstFrame() {
    if (graphicsFailed) { removeFirstFrame?.(); removeFirstFrame = null; return; }
    // Wait for the local base image to reach the globe before dismissing its
    // status. Later remote imagery streams without becoming foreground loading.
    if (!isReady()) return;
    performance.mark?.('relic-world-first-frame');
    loading?.ready();
    removeFirstFrame?.(); removeFirstFrame = null;
    onReady();
  });
  if (typeof ResizeObserver === 'function') {
    viewportObserver = new ResizeObserver(() => {
      if (!alive() || graphicsFailed) return;
      viewer.resize(); quality();
    });
    const viewport = viewer.container || viewer.scene.canvas.parentElement;
    if (viewport) viewportObserver.observe(viewport);
  }
  quality();
  activity();
  performance.mark?.('relic-world-engine-ready');
  return dispose;
}

export function cameraDuration(seconds) {
  const reduced = document.documentElement.dataset.motion === 'reduced'
    || (!document.documentElement.dataset.motion && matchMedia('(prefers-reduced-motion: reduce)').matches);
  return reduced ? 0 : Math.min(.95, Math.max(0, seconds));
}

/** Move now using already-loaded relief, then refine from the renderer's own
 *  tile cache. Selecting a place never waits on a separate elevation request. */
export function flyToLocation(viewer, Cesium, { lat, lon, ellipsoid, range, duration = .8, sphereRadius = 100, current = () => true }) {
  if (!viewer || viewer.isDestroyed()) return;
  const point = Cesium.Cartographic.fromDegrees(lon, lat);
  const cached = viewer.scene.globe.getHeight(point);
  const initialHeight = Number.isFinite(cached) ? cached : 0;
  function fly(height, seconds) {
    if (viewer.isDestroyed() || !current()) return;
    viewer.camera.cancelFlight();
    performance.mark?.('relic-location-flight-start');
    const destination = Cesium.Cartesian3.fromDegrees(lon, lat,
      height * viewer.scene.verticalExaggeration, ellipsoid);
    viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(destination, sphereRadius), {
      offset:new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-34), range),
      duration:cameraDuration(seconds),
    });
    viewer.scene.requestRender();
  }
  fly(initialHeight, duration);
  let remove;
  let timeout;
  const finish = () => { clearTimeout(timeout); remove?.(); remove = null; };
  remove = viewer.scene.globe.tileLoadProgressEvent.addEventListener(count => {
    if (viewer.isDestroyed() || !current()) { finish(); return; }
    if (count !== 0) return;
    const measuredHeight = viewer.scene.globe.getHeight(point);
    if (!Number.isFinite(measuredHeight)) return;
    finish();
    if (Math.abs(measuredHeight - initialHeight) > 2) fly(measuredHeight, .3);
  });
  timeout = setTimeout(finish, 1800);
}
