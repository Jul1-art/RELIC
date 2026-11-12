// Extracted from God's Eye View celestialRing.js, MIT, commit 10a788db78f0657e2eb5f8cdd830e6417aed354d.
const KEYHOLE_OUTER_RADIUS=1.05,KEYHOLE_LABEL_FEATHER_MAX_RATIO=.4;
let keyholeFadeRatio=.4,keyholeOutsideOpacity=1;
/** Clamp a number to an inclusive range. */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Update the shared fade distance and outside-opacity floor. */
export function setKeyholeFadeTuning({ fadeRatio, outsideOpacity } = {}) {
  if (Number.isFinite(fadeRatio)) {
    keyholeFadeRatio = clamp(fadeRatio, 0, KEYHOLE_LABEL_FEATHER_MAX_RATIO);
  }
  if (Number.isFinite(outsideOpacity)) {
    keyholeOutsideOpacity = clamp(outsideOpacity, 0, 1);
  }
  return getKeyholeFadeTuning();
}

/** Read the current normalized keyhole fade settings. */
export function getKeyholeFadeTuning() {
  return { fadeRatio: keyholeFadeRatio, outsideOpacity: keyholeOutsideOpacity };
}

/** Return the single shared screen-space keyhole circle and label feather. */
export function getKeyholeGeometry(width, height) {
  const w = Number(width);
  const h = Number(height);
  if (!(w > 0) || !(h > 0)) {
    return { centerX: 0, centerY: 0, radius: 0, featherPx: 0 };
  }
  const radius = h * 0.5 * KEYHOLE_OUTER_RADIUS;
  return {
    centerX: w * 0.5,
    centerY: h * 0.5,
    radius,
    featherPx: radius * keyholeFadeRatio,
  };
}

/**
 * Compute the radial opacity for a callout's visual center. Text remains fully
 * opaque inside the keyhole and fades linearly to the configured outside-opacity
 * floor through a band derived from the live keyhole radius.
 */
export function keyholeLabelAlpha(labelX, labelY, width, height) {
  return keyholeLabelAlphaFromGeometry(
    labelX,
    labelY,
    getKeyholeGeometry(width, height),
  );
}

/** Compute keyhole opacity from geometry already cached by a hot render loop. */
export function keyholeLabelAlphaFromGeometry(labelX, labelY, geometry) {
  if (
    !geometry ||
    !(geometry.radius > 0) ||
    !Number.isFinite(labelX) ||
    !Number.isFinite(labelY)
  )
    return 0;
  const feather = geometry.featherPx;
  const distance = Math.hypot(
    labelX - geometry.centerX,
    labelY - geometry.centerY,
  );
  if (distance <= geometry.radius) return 1;
  if (!(feather > 0) || distance >= geometry.radius + feather)
    return keyholeOutsideOpacity;
  const progress = clamp((distance - geometry.radius) / feather, 0, 1);
  return 1 - (1 - keyholeOutsideOpacity) * progress;
}
