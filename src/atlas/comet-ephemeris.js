/** Interpolates the published Horizons states, without inventing coverage. */
export const AU_KM = 149597870.7;
export const COMET_IDS = Object.freeze(['67p', 'philae', 'rosetta']);

export function interpolateCometState(catalogue, date = new Date()) {
  const time = Number(date), states = catalogue?.states;
  if (!Number.isFinite(time) || !states?.length) return null;
  const jd = time / 86400000 + 2440587.5;
  if (jd < states[0][0] || jd > states.at(-1)[0]) return null;
  let lo = 0, hi = states.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (states[mid][0] <= jd) lo = mid; else hi = mid; }
  const a = states[lo], b = states[hi], days = b[0] - a[0];
  if (!(days > 0)) return null;
  const t = (jd - a[0]) / days, t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  const coordinates = [1, 2, 3].map(axis => h00 * a[axis] + h10 * days * a[axis + 3] + h01 * b[axis] + h11 * days * b[axis + 3]);
  if (!coordinates.every(Number.isFinite)) return null;
  return { positionKm: {x:coordinates[0], y:coordinates[1], z:coordinates[2]}, distanceKm:Math.hypot(...coordinates), validAt:new Date(time).toISOString(), solution:catalogue.solution, state:'ephemeris', interpolated:true };
}

/** Same ecliptic axes as the atlas; the solar overview explicitly condenses distance. */
export function cometPositionInScene(positionKm, auToWorld) {
  const {x, y, z} = positionKm, distance = Math.hypot(x, y, z);
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const scale = auToWorld(distance / AU_KM) / distance;
  return {x:x * scale, y:z * scale, z:-y * scale};
}

/** CHEOPS X,Y,Z -> atlas X,Z,-Y; landing and shape use this identical transform. */
export function cometFixedInScene([x, y, z], scale = 1) { return {x:x * scale, y:z * scale, z:-y * scale}; }
