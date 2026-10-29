/** Match wheel and trackpad gestures without abrupt changes of scale. */
export function wheelZoomFactor(deltaY, deltaMode = 0, viewportHeight = 800) {
  if (!Number.isFinite(deltaY)) return 1;
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1);
  return Math.exp(Math.max(-.22, Math.min(.22, pixels / 800)));
}

/** Auto views leave a planetary system before its distant irregular orbits flood it. */
export function systemExitDistance(radius, innerExtent, fullExtent, mode = 'auto') {
  const extent = mode === 'all' ? fullExtent : innerExtent;
  return Math.max(radius * 75, (Number.isFinite(extent) ? extent : radius) * 3.8, 50);
}

export function finiteCameraState(position, target) {
  return [position.x, position.y, position.z, target.x, target.y, target.z].every(Number.isFinite);
}
