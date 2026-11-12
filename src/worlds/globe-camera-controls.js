/* Native Cesium navigation and trackpad relay from God's Eye View (MIT).
 * Upstream: src/app/viewer.js, 10a788db78f0657e2eb5f8cdd830e6417aed354d.
 * RELIC adapts the zoom-out framing to each world and permits a smaller globe.
 */
import * as Cesium from '../../vendor/cesium/index.js';

export function globeZoomOutLimit(radius, fovy, share = .08) {
  const angular = Math.atan(share * Math.tan(fovy / 2));
  return radius / Math.sin(angular) - radius;
}

/** Retain Cesium's own globe-grab, tilt, distance-aware zoom and inertia. */
export function installGlobeCameraControls(viewer, {radius, minimum = 10} = {}) {
  const {scene,camera} = viewer;
  const controller = scene.screenSpaceCameraController;
  controller.minimumZoomDistance = minimum;
  controller.enableCollisionDetection = true;
  // This is the touch-only sensitivity adjustment in createApplicationViewer.
  if (globalThis.matchMedia?.('(pointer: coarse)').matches) controller.zoomFactor *= 3;
  const removeLimit = scene.preRender.addEventListener(() => {
    const fovy = camera.frustum.fovy;
    controller.maximumZoomDistance = scene.mode === Cesium.SceneMode.SCENE3D && Number.isFinite(fovy)
      ? Math.max(globeZoomOutLimit(radius, fovy), camera.positionCartographic?.height ?? 0)
      : Number.POSITIVE_INFINITY;
  });
  const removePinch = installTrackpadPinchZoom(viewer);
  return () => { removePinch(); removeLimit(); };
}

const PINCH_ZOOM_MULTIPLIER = 8;
const MAX_PINCH_PIXEL_DELTA = 120;

function boundedPinchDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return delta;
  return (
    Math.sign(delta) *
    Math.min(Math.abs(delta) * PINCH_ZOOM_MULTIPLIER, MAX_PINCH_PIXEL_DELTA)
  );
}

/**
 * Add browser trackpad pinch to Cesium's zoom inputs and return its disposer.
 * Browsers expose this gesture as a small pixel-mode Ctrl+wheel event.
 */
export function installTrackpadPinchZoom(
  viewer,
  { createWheelEvent = (type, init) => new WheelEvent(type, init) } = {},
) {
  const controller = viewer?.scene?.screenSpaceCameraController;
  const container = viewer?.container;
  const canvas = viewer?.canvas;
  if (!controller || !container || !canvas)
    throw new TypeError('A complete Cesium viewer is required');

  const originalZoomEventTypes = controller.zoomEventTypes;
  const zoomEventTypes = Array.isArray(originalZoomEventTypes)
    ? originalZoomEventTypes
    : originalZoomEventTypes === undefined
      ? []
      : [originalZoomEventTypes];
  const alreadyHandlesControlWheel = zoomEventTypes.some(
    (binding) =>
      binding?.eventType === Cesium.CameraEventType.WHEEL &&
      binding?.modifier === Cesium.KeyboardEventModifier.CTRL,
  );
  const configuredZoomEventTypes = alreadyHandlesControlWheel
    ? originalZoomEventTypes
    : [
        ...zoomEventTypes,
        {
          eventType: Cesium.CameraEventType.WHEEL,
          modifier: Cesium.KeyboardEventModifier.CTRL,
        },
      ];
  if (!alreadyHandlesControlWheel)
    controller.zoomEventTypes = configuredZoomEventTypes;

  const relayedEvents = new WeakSet();
  const relayPinch = (event) => {
    if (
      !event.ctrlKey ||
      relayedEvents.has(event) ||
      event.deltaMode !== 0 ||
      !Number.isFinite(event.deltaY) ||
      event.deltaY === 0
    )
      return;
    let relayed;
    try {
      relayed = createWheelEvent('wheel', {
        deltaX: event.deltaX,
        deltaY: boundedPinchDelta(event.deltaY),
        deltaZ: event.deltaZ,
        deltaMode: event.deltaMode,
        screenX: event.screenX,
        screenY: event.screenY,
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
        view: globalThis.window,
      });
    } catch {
      // The registered Ctrl+wheel binding can still consume the original.
      return;
    }
    relayedEvents.add(relayed);
    event.preventDefault();
    event.stopPropagation();
    canvas.dispatchEvent(relayed);
  };
  container.addEventListener('wheel', relayPinch, {
    capture: true,
    passive: false,
  });

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    container.removeEventListener('wheel', relayPinch, true);
    if (
      !alreadyHandlesControlWheel &&
      controller.zoomEventTypes === configuredZoomEventTypes
    )
      controller.zoomEventTypes = originalZoomEventTypes;
  };
}

