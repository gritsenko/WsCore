/**
 * Snapshot interpolation (pure, no DOM/THREE). The server sends tick snapshots at
 * ~15 Hz, stamped with its simulation time (`GameTickUpdateEvent.serverTimeMs`), and
 * as deltas: an avatar missing from a snapshot has not changed. Each avatar keeps a
 * short buffer of timestamped positions (`PositionBuffer`); the renderer draws it at
 * `serverNow − delay` (`ServerClock`), interpolating between the two samples around that
 * time. Being a little in the past means there is (almost) always a sample on both
 * sides, so motion is smooth and exact instead of chasing the latest position.
 *
 * Times are milliseconds. Sample times are server time; the clock maps local time
 * (`performance.now()`) onto server time.
 */

/** A jump longer than this between two consecutive samples is a teleport (respawn): snap. */
export const TELEPORT_DISTANCE = 250;

/**
 * When render time runs past the newest sample (a late snapshot), the position holds
 * there, but the last known velocity is still reported for this long, so a moving
 * avatar's run animation doesn't flicker to idle on a hiccup.
 */
export const VELOCITY_GRACE_MS = 150;

const MAX_SAMPLES = 32;
/** A sample this far older than the newest one means the server time base restarted. */
const TIME_BASE_RESET_MS = 10_000;

/** Result of `PositionBuffer.sample`: position and velocity (units per second). */
export interface MotionState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Sample {
  t: number;
  x: number;
  y: number;
}

export class PositionBuffer {
  private samples: Sample[] = [];
  // Velocity of the newest segment (units/s), reported during VELOCITY_GRACE_MS.
  private tailVx = 0;
  private tailVy = 0;

  get size(): number {
    return this.samples.length;
  }

  /**
   * Forget the history and stand at (x, y) with no timestamp — e.g. from a full player
   * state (join / game state) that carries no server time. The first timed sample
   * replaces it.
   */
  reset(x: number, y: number): void {
    this.samples = [{ t: -Infinity, x, y }];
    this.tailVx = this.tailVy = 0;
  }

  /** The avatar was at (x, y) at server time `t`. Older/duplicate times are ignored. */
  push(t: number, x: number, y: number): void {
    const s = this.samples;
    const n = s.length;
    if (n === 0) {
      s.push({ t, x, y });
      return;
    }
    const last = s[n - 1];
    if (t < last.t - TIME_BASE_RESET_MS) {
      // Far in the past: a new time base (ServerTimeMs wrapped after ~49 days), not a
      // stale snapshot — start over rather than ignore every future sample.
      this.samples = [{ t, x, y }];
      this.tailVx = this.tailVy = 0;
      return;
    }
    if (!(t > last.t)) return; // out of order or duplicate

    // Untimed seed (reset) or a teleport: start over at the new position, no slide.
    if (last.t === -Infinity || Math.hypot(x - last.x, y - last.y) > TELEPORT_DISTANCE) {
      this.samples = [{ t, x, y }];
      this.tailVx = this.tailVy = 0;
      return;
    }

    // Standing still: stretch the stationary segment instead of growing the buffer.
    if (n >= 2) {
      const prev = s[n - 2];
      if (x === last.x && y === last.y && prev.x === x && prev.y === y) {
        last.t = t;
        return;
      }
    }

    const dt = (t - last.t) / 1000;
    this.tailVx = (x - last.x) / dt;
    this.tailVy = (y - last.y) / dt;
    s.push({ t, x, y });
    if (s.length > MAX_SAMPLES) s.shift();
  }

  /**
   * A snapshot at server time `t` did not include this avatar: it is unchanged, i.e.
   * still at its newest position. Recording that keeps a later start of movement from
   * being interpolated across the whole idle gap (a slow slide instead of a walk).
   */
  hold(t: number): void {
    const n = this.samples.length;
    if (n === 0) return;
    const last = this.samples[n - 1];
    this.push(t, last.x, last.y);
  }

  /**
   * Position and velocity at server time `renderT` (written into `out`). Before the
   * oldest sample → the oldest; past the newest → the newest (no extrapolation: an
   * avatar absent from delta snapshots must not drift). A non-finite `renderT` (clock
   * not synced yet) → the newest. Returns false if there is no sample at all.
   */
  sample(renderT: number, out: MotionState): boolean {
    const s = this.samples;
    if (s.length === 0) return false;

    if (!Number.isFinite(renderT)) {
      const last = s[s.length - 1];
      return set(out, last.x, last.y, 0, 0);
    }

    // Drop samples no longer needed: keep exactly one at or before renderT.
    let drop = 0;
    while (drop + 1 < s.length && s[drop + 1].t <= renderT) drop++;
    if (drop > 0) s.splice(0, drop);

    const a = s[0];
    if (renderT <= a.t) return set(out, a.x, a.y, 0, 0);
    if (s.length === 1) {
      const recent = renderT - a.t <= VELOCITY_GRACE_MS;
      return set(out, a.x, a.y, recent ? this.tailVx : 0, recent ? this.tailVy : 0);
    }

    const b = s[1];
    const span = b.t - a.t;
    const f = (renderT - a.t) / span;
    return set(
      out,
      a.x + (b.x - a.x) * f,
      a.y + (b.y - a.y) * f,
      ((b.x - a.x) * 1000) / span,
      ((b.y - a.y) * 1000) / span
    );
  }
}

function set(out: MotionState, x: number, y: number, vx: number, vy: number): true {
  out.x = x;
  out.y = y;
  out.vx = vx;
  out.vy = vy;
  return true;
}

/** Fallback send interval until one is observed (15 Hz). */
export const DEFAULT_SNAPSHOT_INTERVAL_MS = 1000 / 15;
/** An offset this much larger than the current one means a new server / long stall: resync. */
const RESYNC_MS = 1000;
/** How fast the offset creeps up toward slower arrivals (it snaps down to faster ones). */
const OFFSET_DRIFT = 0.02;

/**
 * Maps local time onto the server's simulation time. The offset (local − server) tracks
 * the least-delayed snapshot seen: it snaps down to a faster arrival immediately and
 * creeps up slowly (clock drift, route changes), so network jitter doesn't shake the
 * render clock. Also estimates the snapshot send interval from the stamps, from which
 * the interpolation delays follow — no client config to keep in sync with the server.
 */
export class ServerClock {
  private offset = NaN;
  private lastServerMs = NaN;
  /** Estimated time between snapshots (ms). */
  intervalMs = DEFAULT_SNAPSHOT_INTERVAL_MS;

  get synced(): boolean {
    return !Number.isNaN(this.offset);
  }

  reset(): void {
    this.offset = NaN;
    this.lastServerMs = NaN;
    this.intervalMs = DEFAULT_SNAPSHOT_INTERVAL_MS;
  }

  /** A snapshot stamped `serverMs` arrived at local time `localMs`. */
  observe(serverMs: number, localMs: number): void {
    const off = localMs - serverMs;
    if (Number.isNaN(this.offset) || off > this.offset + RESYNC_MS) {
      this.reset();
      this.offset = off;
    } else if (off < this.offset) {
      this.offset = off;
    } else {
      this.offset += (off - this.offset) * OFFSET_DRIFT;
    }

    const d = serverMs - this.lastServerMs;
    if (d > 0 && d < RESYNC_MS) {
      // Like the offset: follow shorter gaps fast, longer ones (lost snapshots) slowly.
      this.intervalMs += (d - this.intervalMs) * (d < this.intervalMs ? 0.5 : 0.05);
    }
    this.lastServerMs = serverMs;
  }

  /** Current server time estimate; NaN until the first snapshot. */
  now(localMs: number): number {
    return localMs - this.offset;
  }

  /**
   * How far in the past remote avatars are drawn: 1.5 send intervals + 15 ms of jitter
   * margin (≈115 ms at 15 Hz), so the next snapshot is normally in before it's needed.
   */
  remoteDelayMs(): number {
    return this.intervalMs * 1.5 + 15;
  }

  /**
   * The local avatar is drawn with less delay (one interval + 25 ms, ≈92 ms at 15 Hz):
   * more responsive, at the cost of an occasional brief hold when a snapshot is late.
   */
  localDelayMs(): number {
    return this.intervalMs + 25;
  }
}
