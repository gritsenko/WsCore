/** Max pointer travel (CSS px) between down and up for the gesture to count as a click. */
export const CLICK_MAX_DISTANCE_PX = 5;
/** Max press duration (ms) for the gesture to count as a click rather than a hold/drag. */
export const CLICK_MAX_DURATION_MS = 500;

export interface PointerSample {
  x: number;
  y: number;
  /** Timestamp in ms (e.g. event.timeStamp). */
  t: number;
}

/**
 * Decide whether a pointerdown→pointerup pair is a click (move-to target) or the end of
 * a camera drag (OrbitControls rotate/zoom). Movement beyond the distance threshold or a
 * long press both count as a drag.
 */
export function isClickGesture(
  down: PointerSample,
  up: PointerSample,
  maxDistancePx = CLICK_MAX_DISTANCE_PX,
  maxDurationMs = CLICK_MAX_DURATION_MS
): boolean {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  if (dx * dx + dy * dy > maxDistancePx * maxDistancePx) return false;
  return up.t - down.t <= maxDurationMs;
}
