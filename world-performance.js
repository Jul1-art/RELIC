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

export const TOP_DOWN_PITCH = -Math.PI / 2 + .0002;

/** Fit the globe's complete limb inside the smaller camera field of view.
 * Credit rows, the inspector and device rotation all change the actual canvas.
 * Automatic framing ends as soon as the visitor starts exploring a location.
 */
export function createOverviewFraming(viewer, Cesium, {
  ellipsoid = Cesium.Ellipsoid.WGS84, latitude = 18, longitude = 0, padding = 1.12,
} = {}) {
  const canvas = viewer.scene.canvas;
  const container = viewer.container || canvas.parentElement;
  const radius = ellipsoid.maximumRadius;
  let active = false, disposed = false, frame = 0, lastWidth = 0, lastHeight = 0;
  const alive = () => !disposed && !viewer.isDestroyed();
  function fit(duration = 0) {
    if (!alive() || !active) return;
    viewer.resize();
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    const aspect = width / height;
    const field = viewer.camera.frustum.fov || Math.PI / 3;
    const horizontal = aspect >= 1 ? field : 2 * Math.atan(Math.tan(field / 2) * aspect);
    const vertical = aspect >= 1 ? 2 * Math.atan(Math.tan(field / 2) / aspect) : field;
    const halfAngle = Math.max(.005, Math.min(horizontal, vertical) / 2);
    const altitude = radius * padding / Math.sin(halfAngle) - radius;
    lastWidth = width; lastHeight = height;
    const controller = viewer.scene.screenSpaceCameraController;
    controller.maximumZoomDistance = Math.max(controller.maximumZoomDistance, altitude * 1.25);
    const options = {
      destination:Cesium.Cartesian3.fromDegrees(longitude, latitude, altitude, ellipsoid),
      // A minute tilt avoids Cesium's center-pick zoom singularity on a
      // perfectly spherical Moon/Mars (normalizing parallel radial vectors).
      orientation:{ heading:0, pitch:TOP_DOWN_PITCH, roll:0 },
    };
    viewer.camera.cancelFlight();
    const seconds = cameraDuration(duration);
    if (seconds) viewer.camera.flyTo({ ...options, duration:seconds });
    else viewer.camera.setView(options);
    viewer.scene.requestRender();
  }
  function refresh() {
    frame = 0;
    if (!alive() || !active || document.hidden) return;
    viewer.resize();
    if (canvas.clientWidth !== lastWidth || canvas.clientHeight !== lastHeight) fit();
  }
  function schedule() { if (!frame && active && !disposed) frame = requestAnimationFrame(refresh); }
  function stop() { active = false; cancelAnimationFrame(frame); frame = 0; }
  function show(duration = 0) { active = true; fit(duration); }
  const visibility = () => { if (!document.hidden) schedule(); };
  const pagehide = event => { if (!event.persisted) dispose(); };
  function dispose() {
    if (disposed) return;
    stop(); disposed = true; observer?.disconnect();
    canvas.removeEventListener('pointerdown', stop);
    canvas.removeEventListener('wheel', stop);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
    window.removeEventListener('pagehide', pagehide);
    document.removeEventListener('visibilitychange', visibility);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  if (container) observer?.observe(container);
  canvas.addEventListener('pointerdown', stop, { passive:true });
  canvas.addEventListener('wheel', stop, { passive:true });
  window.addEventListener('resize', schedule, { passive:true });
  window.addEventListener('pageshow', schedule);
  window.addEventListener('pagehide', pagehide);
  document.addEventListener('visibilitychange', visibility);
  return { show, stop, refresh:schedule, dispose, get active() { return active; } };
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
