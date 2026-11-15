import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SNAPSHOT_INTERVAL_MS,
  MotionState,
  PositionBuffer,
  ServerClock,
  TELEPORT_DISTANCE,
  VELOCITY_GRACE_MS,
} from './SnapshotInterpolation';

function at(buf: PositionBuffer, t: number): MotionState {
  const out = { x: NaN, y: NaN, vx: NaN, vy: NaN };
  expect(buf.sample(t, out)).toBe(true);
  return out;
}

describe('PositionBuffer', () => {
  it('has nothing to sample when empty', () => {
    expect(new PositionBuffer().sample(0, { x: 0, y: 0, vx: 0, vy: 0 })).toBe(false);
  });

  it('a single sample: stands there, not moving', () => {
    const b = new PositionBuffer();
    b.push(100, 5, 6);
    expect(at(b, 0)).toEqual({ x: 5, y: 6, vx: 0, vy: 0 });
    expect(at(b, 100)).toEqual({ x: 5, y: 6, vx: 0, vy: 0 });
    expect(at(b, 1000)).toEqual({ x: 5, y: 6, vx: 0, vy: 0 });
  });

  it('interpolates linearly between the surrounding samples, with segment velocity', () => {
    const b = new PositionBuffer();
    b.push(0, 0, 0);
    b.push(100, 10, -20);
    b.push(200, 30, -20);
    expect(at(b, 50)).toEqual({ x: 5, y: -10, vx: 100, vy: -200 });
    expect(at(b, 150)).toEqual({ x: 20, y: -20, vx: 200, vy: 0 });
  });

  it('handles uneven sample spacing (a lost snapshot is just a longer segment)', () => {
    const b = new PositionBuffer();
    b.push(0, 0, 0);
    b.push(200, 40, 0); // the snapshot at 100 never arrived
    expect(at(b, 100).x).toBeCloseTo(20);
    expect(at(b, 100).vx).toBeCloseTo(200);
  });

  it('before the oldest sample: holds the oldest', () => {
    const b = new PositionBuffer();
    b.push(100, 1, 1);
    b.push(200, 2, 2);
    expect(at(b, 50)).toEqual({ x: 1, y: 1, vx: 0, vy: 0 });
  });

  it('past the newest sample: holds position (no extrapolation), velocity only during the grace', () => {
    const b = new PositionBuffer();
    b.push(0, 0, 0);
    b.push(100, 10, 0);
    const late = at(b, 100 + VELOCITY_GRACE_MS - 1);
    expect(late.x).toBe(10); // never drifts past the last known position
    expect(late.vx).toBeCloseTo(100); // still "running" through a short hiccup
    expect(at(b, 100 + VELOCITY_GRACE_MS + 1)).toEqual({ x: 10, y: 0, vx: 0, vy: 0 });
  });

  it('a non-finite render time (clock not synced) draws the newest sample', () => {
    const b = new PositionBuffer();
    b.push(0, 0, 0);
    b.push(100, 10, 0);
    expect(at(b, NaN)).toEqual({ x: 10, y: 0, vx: 0, vy: 0 });
  });

  it('a stop that was transmitted brings velocity to zero', () => {
    const b = new PositionBuffer();
    b.push(0, 0, 0);
    b.push(100, 10, 0);
    b.push(200, 20, 0); // stopped here...
    b.push(300, 20, 0); // ...the stopped state repeated
    expect(at(b, 150).vx).toBeCloseTo(100);
    expect(at(b, 250)).toEqual({ x: 20, y: 0, vx: 0, vy: 0 });
  });

  it('hold(): an avatar absent from a delta snapshot stays put, and a later start is a walk, not a slide over the idle gap', () => {
    const b = new PositionBuffer();
    b.push(0, 0, 0);
    for (let t = 100; t <= 5000; t += 100) b.hold(t); // idle, missing from deltas
    expect(b.size).toBeLessThanOrEqual(2); // stationary holds coalesce
    expect(at(b, 4950)).toEqual({ x: 0, y: 0, vx: 0, vy: 0 });

    b.push(5100, 10, 0); // starts walking
    // Without the holds this would be a 5 s segment: x ≈ 9.9 at 5050.
    expect(at(b, 5050)).toEqual({ x: 5, y: 0, vx: 100, vy: 0 });
  });

  it('hold() on an empty buffer is a no-op', () => {
    const b = new PositionBuffer();
    b.hold(100);
    expect(b.size).toBe(0);
  });

  it('a teleport (respawn) snaps instead of sliding across the map', () => {
    const b = new PositionBuffer();
    b.push(0, 0, 0);
    b.push(100, 10, 0);
    b.push(200, 10 + TELEPORT_DISTANCE + 1, 500);
    expect(b.size).toBe(1);
    // Even a render time before the jump shows the new place at once.
    expect(at(b, 150)).toEqual({ x: 10 + TELEPORT_DISTANCE + 1, y: 500, vx: 0, vy: 0 });
  });

  it('ignores duplicate and out-of-order samples', () => {
    const b = new PositionBuffer();
    b.push(100, 1, 0);
    b.push(100, 99, 0);
    b.push(50, 99, 0);
    expect(b.size).toBe(1);
    expect(at(b, 100).x).toBe(1);
  });

  it('a sample far older than the newest is a new time base (ServerTimeMs wrap): starts over', () => {
    const b = new PositionBuffer();
    b.push(4_294_960_000, 1, 0);
    b.push(4_294_960_066, 2, 0);
    b.push(30, 3, 0); // wrapped
    expect(b.size).toBe(1);
    b.push(96, 4, 0);
    expect(at(b, 63).x).toBeCloseTo(3.5);
  });

  it('reset(): an untimed full state is replaced by the first timed sample', () => {
    const b = new PositionBuffer();
    b.reset(3, 4);
    expect(at(b, 12345)).toEqual({ x: 3, y: 4, vx: 0, vy: 0 });
    b.push(1000, 5, 4);
    expect(b.size).toBe(1);
    expect(at(b, 900)).toEqual({ x: 5, y: 4, vx: 0, vy: 0 });
    b.reset(0, 0);
    expect(b.size).toBe(1);
  });

  it('drops samples that are behind the render time and stays bounded', () => {
    const b = new PositionBuffer();
    for (let i = 0; i < 100; i++) b.push(i * 10, i, 0);
    expect(b.size).toBeLessThanOrEqual(32);
    at(b, 985);
    expect(b.size).toBe(2); // 980 and 990
    expect(at(b, 985).x).toBeCloseTo(98.5);
  });
});

describe('ServerClock', () => {
  it('is unsynced until the first snapshot', () => {
    const c = new ServerClock();
    expect(c.synced).toBe(false);
    expect(c.now(1000)).toBeNaN();
    c.observe(500, 1000);
    expect(c.synced).toBe(true);
    expect(c.now(1100)).toBe(600);
  });

  it('tracks the least-delayed arrival: snaps to faster ones, ignores jitter', () => {
    const c = new ServerClock();
    c.observe(0, 1000); // offset 1000
    c.observe(66, 1080); // 14 ms late: offset creeps only slightly
    expect(c.now(2000)).toBeGreaterThan(1000 - 1);
    expect(c.now(2000)).toBeLessThanOrEqual(1000);
    c.observe(133, 1128); // faster than ever: offset 995
    expect(c.now(2000)).toBe(1005);
  });

  it('resyncs on a large jump (restarted server / new time base)', () => {
    const c = new ServerClock();
    c.observe(100000, 1000);
    c.observe(10, 5000); // new server: its time restarted
    expect(c.now(5000)).toBe(10);
  });

  it('estimates the send interval and derives the interpolation delays from it', () => {
    const c = new ServerClock();
    expect(c.intervalMs).toBeCloseTo(DEFAULT_SNAPSHOT_INTERVAL_MS);
    for (let i = 0; i < 100; i++) c.observe(i * 33, 1000 + i * 33); // 30 Hz
    expect(c.intervalMs).toBeCloseTo(33, 0);
    expect(c.remoteDelayMs()).toBeCloseTo(33 * 1.5 + 15, 0);
    expect(c.localDelayMs()).toBeCloseTo(33 + 25, 0);
    expect(c.localDelayMs()).toBeLessThan(c.remoteDelayMs());

    // A lost snapshot (one 66 ms gap) barely moves it.
    c.observe(100 * 33 + 33, 1000 + 100 * 33 + 33);
    expect(c.intervalMs).toBeLessThan(36);
  });

  it('reset() forgets everything', () => {
    const c = new ServerClock();
    c.observe(0, 0);
    c.reset();
    expect(c.synced).toBe(false);
    expect(c.intervalMs).toBeCloseTo(DEFAULT_SNAPSHOT_INTERVAL_MS);
  });
});
