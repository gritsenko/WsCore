export function isBitSet(target: number, i: number): number {
  return target & (1 << i);
}

export function setBit(target: number, i: number): number {
  const mask = 1 << i;
  target |= mask;
  return target;
}

export function clearBit(target: number, i: number): number {
  const mask = 1 << i;
  target &= ~mask;
  return target;
}

export function pad(num: number, size: number): string {
  const s = '000000000' + num;
  return s.substr(s.length - size);
}

export function lerp(v0: number, v1: number, t: number): number {
  return v0 * (1 - t) + v1 * t;
}

/**
 * Frame-rate-independent exponential smoothing factor: the fraction of the remaining
 * distance to cover over `dt` seconds at decay rate `k` (1/s). Use as
 * `lerp(current, target, smoothingFactor(k, dt))`. Returns 0 for dt <= 0.
 */
export function smoothingFactor(k: number, dt: number): number {
  if (dt <= 0) return 0;
  return 1 - Math.exp(-k * dt);
}

/**
 * Decay rate whose per-frame smoothing at `fps` equals a legacy fixed per-frame lerp
 * factor `alpha` — i.e. smoothingFactor(rateFromPerFrameLerp(a, 60), 1/60) === a.
 */
export function rateFromPerFrameLerp(alpha: number, fps = 60): number {
  return -Math.log(1 - alpha) * fps;
}

/** Longest frame step the render loop will simulate (e.g. after a backgrounded tab). */
export const MAX_FRAME_DT = 0.1;

/** Convert a RAF timestamp delta (ms) to seconds, clamped to [0, MAX_FRAME_DT]. */
export function frameDeltaSeconds(nowMs: number, prevMs: number): number {
  const dt = (nowMs - prevMs) / 1000;
  if (!(dt > 0)) return 0;
  return Math.min(dt, MAX_FRAME_DT);
}

/**
 * Advance a sprite-sheet frame by accumulated time. Returns the new frame index and the
 * leftover accumulator (seconds) so animation speed is `fps` regardless of refresh rate.
 */
export function advanceFrame(
  frame: number,
  accumulator: number,
  dt: number,
  fps: number,
  frameCount: number
): { frame: number; accumulator: number } {
  if (frameCount <= 0 || fps <= 0) return { frame: 0, accumulator: 0 };
  const frameDuration = 1 / fps;
  let acc = accumulator + Math.max(0, dt);
  // Epsilon so summed float dts landing exactly on a frame boundary still tick.
  const steps = Math.floor(acc / frameDuration + 1e-9);
  acc = Math.max(0, acc - steps * frameDuration);
  return { frame: (frame + steps) % frameCount, accumulator: acc };
}
