/* Orbit interpolation from God's Eye View's createCameraOrientationAnimator
 * (MIT, a33bc379, src/ui/cameraOrientationControls.js). RELIC supplies the
 * target frame for each world and also interpolates range for globe flights.
 */
import {cameraDuration} from './world-performance.js';

export const OBLIQUE_PITCH = -35 * Math.PI / 180;
export const STRAIGHT_DOWN_PITCH = -89 * Math.PI / 180;
export const OBLIQUE_THRESHOLD = -60 * Math.PI / 180;

export function createInspectionCameraMotion({Cesium,viewer,applyFrame,now=()=>performance.now()}) {
  let remove = null;
  let pending = null;
  function cancel() {
    remove?.();
    remove = null;
    pending = null;
  }
  function animate(frame, destination, duration = 650) {
    cancel();
    const target = { ...frame, ...destination };
    if (!cameraDuration(1) || duration <= 0) {
      applyFrame(target);
      return true;
    }
    pending = target;
    const start = now();
    const headingDelta = Cesium.Math.negativePiToPi(
      target.heading - frame.heading,
    );
    remove = viewer.scene.preUpdate.addEventListener(() => {
      if (viewer.isDestroyed()) {
        cancel();
        return;
      }
      const progress = cameraDuration(1) ? Cesium.Math.clamp((now() - start) / duration, 0, 1) : 1;
      const eased = Cesium.EasingFunction.CUBIC_IN_OUT(progress);
      const next = {
        ...target,
        heading: frame.heading + headingDelta * eased,
        pitch: Cesium.Math.lerp(frame.pitch, target.pitch, eased),
        range: Cesium.Math.lerp(frame.range, target.range, eased),
      };
      if (Number.isFinite(frame.fov) && Number.isFinite(target.fov)) {
        next.fov = Cesium.Math.lerp(frame.fov, target.fov, eased);
      }
      applyFrame(next);
      if (progress === 1) cancel();
    });
    viewer.scene.requestRender();
    return true;
  }
  return {
    animate,
    cancel,
    get destination() { return pending; },
  };
}
