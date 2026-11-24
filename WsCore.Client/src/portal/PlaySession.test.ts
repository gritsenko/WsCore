import { describe, it, expect, beforeEach } from 'vitest';
import PlaySession, {
  EVENT_FLUSH_AT,
  HEARTBEAT_MS,
  newSessionId,
  type PlayEvent,
} from './PlaySession';

describe('PlaySession', () => {
  let now: number;
  let tick: (() => void) | null;
  let engaged: boolean;
  let beats: [number, boolean][];
  let sent: PlayEvent[][];
  let session: PlaySession;

  // Advance `ms` of wall time in 1 s ticks (as the interval would).
  function play(ms: number, step = 1000): void {
    for (let t = 0; t < ms; t += step) {
      now += step;
      tick?.();
    }
  }

  beforeEach(() => {
    now = 1_000_000;
    tick = null;
    engaged = true;
    beats = [];
    sent = [];
    session = new PlaySession({
      now: () => now,
      setInterval: fn => {
        tick = fn;
        return 1;
      },
      clearInterval: () => {
        tick = null;
      },
      engaged: () => engaged,
      sendBeat: (ms, ended) => beats.push([ms, ended]),
      sendEvents: events => sent.push(events),
    });
  });

  it('opens with a beat, then beats every 20 s of played time, and ends with one', () => {
    session.start();
    expect(beats).toEqual([[0, false]]);
    play(19_000);
    expect(beats).toHaveLength(1);
    play(1_000);
    expect(beats).toEqual([
      [0, false],
      [HEARTBEAT_MS, false],
    ]);
    play(5_000);
    session.stop();
    expect(beats[beats.length - 1]).toEqual([25_000, true]);
    session.stop(); // idempotent
    expect(beats).toHaveLength(3);
    expect(tick).toBeNull();
  });

  it('counts only engaged time', () => {
    session.start();
    play(10_000);
    engaged = false; // hidden tab, unfocused window or an ad on screen
    play(60_000);
    engaged = true;
    play(5_000);
    session.stop();
    expect(beats[beats.length - 1]).toEqual([15_000, true]);
  });

  it("does not credit a suspended tab's gap", () => {
    session.start();
    play(5_000);
    now += 10 * 60_000; // the laptop slept
    tick?.();
    play(2_000);
    session.stop();
    expect(beats[beats.length - 1]).toEqual([7_000, true]);
  });

  it('reports at once when the tab is hidden', () => {
    session.start();
    play(4_000);
    session.hidden();
    expect(beats[beats.length - 1]).toEqual([4_000, false]);
  });

  it('events ride the beats, or go early in batches; the last ones before the ending beat', () => {
    session.start();
    session.event('level_complete', '1', '');
    expect(sent).toEqual([]);
    play(HEARTBEAT_MS);
    expect(sent).toEqual([[{ name: 'level_complete', level: '1', params: '' }]]);

    for (let i = 0; i < EVENT_FLUSH_AT; i++) session.event('tap', '', '');
    expect(sent).toHaveLength(2);
    expect(sent[1]).toHaveLength(EVENT_FLUSH_AT);

    session.event('quit', '', '{}');
    const order: string[] = [];
    // stop(): the events go while the session is still open, then the ending beat.
    const lastBeats = beats.length;
    session.stop();
    order.push(
      sent.length === 3 ? 'events' : 'no-events',
      beats.length > lastBeats ? 'beat' : 'no-beat'
    );
    expect(order).toEqual(['events', 'beat']);
    session.event('late', '', '');
    expect(sent).toHaveLength(3);
  });

  it('makes 32-hex session ids', () => {
    expect(newSessionId()).toMatch(/^[0-9a-f]{32}$/);
    expect(newSessionId()).not.toBe(newSessionId());
  });
});
