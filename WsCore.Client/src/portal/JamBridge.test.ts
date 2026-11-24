import { describe, it, expect, beforeEach, vi } from 'vitest';
import JamBridge, {
  AD_DEBOUNCE_MS,
  AD_REWARDED_MS,
  LeaderboardError,
  type AdShow,
  type BridgeTimers,
} from './JamBridge';

type Posted = { type: string; payload: Record<string, unknown> };

const last = (list: Posted[]): Posted | undefined => list[list.length - 1];

function setup(withBoards = false) {
  let now = 1_000_000;
  const timeouts: { fn: () => void; at: number; id: number }[] = [];
  let nextId = 1;
  const timers: BridgeTimers = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timeouts.push({ fn, at: now + ms, id });
      return id;
    },
    clearTimeout: h => {
      const i = timeouts.findIndex(t => t.id === h);
      if (i >= 0) timeouts.splice(i, 1);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const t of timeouts.filter(t => t.at <= now)) {
      timeouts.splice(timeouts.indexOf(t), 1);
      t.fn();
    }
  };
  const posted: Posted[] = [];
  const shows: AdShow[] = [];
  const ended: string[] = [];
  const splash: string[] = [];
  const events: string[][] = [];
  const vibrate = vi.fn();
  const leaderboard = vi.fn();
  const bridge = new JamBridge(
    {
      post: (type, payload) => posted.push({ type, payload }),
      splash: s => splash.push(s),
      adShow: s => shows.push(s),
      adEnd: id => ended.push(id),
      event: (n, l, p) => events.push([n, l, p]),
      vibrate,
      ...(withBoards ? { leaderboard } : {}),
    },
    timers
  );
  const send = (type: string, payload: Record<string, unknown> = {}) =>
    bridge.receive({ source: 'jam-sdk', v: 2, type, payload });
  return { bridge, send, posted, shows, ended, splash, events, vibrate, leaderboard, advance };
}

describe('JamBridge', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('ignores anything that is not the SDK envelope', () => {
    t.bridge.receive(null);
    t.bridge.receive('ready');
    t.bridge.receive({ source: 'other', type: 'ready' });
    t.bridge.receive({ source: 'jam-host', type: 'ready' });
    expect(t.splash).toEqual([]);
    t.send('ready');
    expect(t.splash).toEqual(['release']);
  });

  it('holds and releases the loading screen', () => {
    t.send('loading');
    t.send('ready');
    expect(t.splash).toEqual(['hold', 'release']);
  });

  it('passes events on as strings; a game cannot mint the ad funnel', () => {
    t.send('event', { name: 'level_complete', level: '3', params: '{"deaths":1}' });
    t.send('event', { name: '' });
    t.send('event', { name: 'ad_rewarded_completed' });
    expect(t.events).toEqual([
      ['level_complete', '3', '{"deaths":1}'],
      ['game_ad_rewarded_completed', '', ''],
    ]);
  });

  it('records the ad funnel itself', () => {
    t.send('ad-request', { id: 'a1', format: 'rewarded' });
    t.send('ad-request', { id: 'a2', format: 'rewarded' });
    t.bridge.finishAd('completed');
    t.advance(AD_DEBOUNCE_MS);
    t.send('ad-request', { id: 'a3', format: 'interstitial', adUI: 'game' });
    t.bridge.finishAd('skipped');
    expect(t.events.map(e => e[0])).toEqual([
      'ad_rewarded_shown',
      'ad_not_ready',
      'ad_rewarded_completed',
      'ad_interstitial_shown_own',
      'ad_interstitial_skipped',
    ]);
  });

  describe('mock ads', () => {
    it('a rewarded ad opens, and claiming it rewards then cools down', () => {
      t.send('ad-request', { id: 'a1', format: 'rewarded', adUI: 'portal' });
      expect(t.posted).toEqual([
        { type: 'ad', payload: { id: 'a1', phase: 'open', durationMs: AD_REWARDED_MS } },
      ]);
      expect(t.shows).toEqual([
        { id: 'a1', format: 'rewarded', own: false, durationMs: AD_REWARDED_MS },
      ]);
      expect(t.bridge.adShowing).toBe(true);

      t.advance(AD_REWARDED_MS); // a rewarded card waits for the player
      expect(t.ended).toEqual([]);
      t.bridge.finishAd('completed');
      expect(last(t.posted)).toEqual({
        type: 'ad',
        payload: { id: 'a1', phase: 'reward', cooldownMs: AD_DEBOUNCE_MS },
      });
      expect(t.ended).toEqual(['a1']);
      expect(t.bridge.adShowing).toBe(false);
    });

    it('a skipped rewarded ad closes without reward', () => {
      t.send('ad-request', { id: 'a1', format: 'rewarded' });
      t.bridge.finishAd('skipped');
      expect(last(t.posted)?.payload).toEqual({ id: 'a1', phase: 'close', cooldownMs: 1500 });
    });

    it('an interstitial ends by itself', () => {
      t.send('ad-request', { id: 'i1', format: 'interstitial' });
      t.advance(3000);
      expect(last(t.posted)?.payload).toMatchObject({ id: 'i1', phase: 'close' });
    });

    it('refuses while one is up and inside the debounce, saying when to retry', () => {
      t.send('ad-request', { id: 'a1', format: 'interstitial' });
      t.send('ad-request', { id: 'a2', format: 'interstitial' });
      expect(last(t.posted)?.payload).toEqual({ id: 'a2', phase: 'error', status: 'not_ready' });

      t.advance(3000); // a1 ends
      t.advance(500);
      t.send('ad-request', { id: 'a3', format: 'rewarded' });
      expect(last(t.posted)?.payload).toEqual({
        id: 'a3',
        phase: 'error',
        status: 'not_ready',
        retryAfterMs: 1000,
      });

      t.advance(1000);
      t.send('ad-request', { id: 'a4', format: 'rewarded' });
      expect(last(t.posted)?.payload).toMatchObject({ id: 'a4', phase: 'open' });
    });

    it("a self-drawn ad ends on its timer, or early on the game's tap", () => {
      t.send('ad-request', { id: 'o1', format: 'rewarded', adUI: 'game' });
      expect(t.shows[0].own).toBe(true);
      t.send('ad-tap', { id: 'wrong' });
      expect(t.bridge.adShowing).toBe(true);
      t.send('ad-tap', { id: 'o1' });
      expect(last(t.posted)?.payload).toMatchObject({ id: 'o1', phase: 'reward' });

      t.advance(AD_DEBOUNCE_MS);
      t.send('ad-request', { id: 'o2', format: 'interstitial', adUI: 'game' });
      t.advance(3000);
      expect(last(t.posted)?.payload).toMatchObject({ id: 'o2', phase: 'close' });
    });
  });

  describe('leaderboards', () => {
    it('without a backend every call fails softly', () => {
      t.send('lb', { id: 'lb1', op: 'score', board: 'best', args: { score: 5 } });
      expect(t.posted).toEqual([
        {
          type: 'lb',
          payload: {
            id: 'lb1',
            ok: false,
            result: null,
            error: 'leaderboards are not available here yet',
            status: 503,
          },
        },
      ]);
    });

    it('refuses unknown operations and bad board names', () => {
      t.send('lb', { id: 'x', op: 'drop', board: 'best' });
      t.send('lb', { id: 'y', op: 'score', board: 'Bad Name' });
      t.send('lb', { op: 'score', board: 'best' }); // no id: nothing to answer
      expect(t.posted.map(p => [p.payload.id, p.payload.status])).toEqual([
        ['x', 400],
        ['y', 400],
      ]);
    });

    it('relays to the backend and answers with its result or refusal', async () => {
      const b = setup(true);
      b.leaderboard.mockResolvedValueOnce({ ok: true, best: 7 });
      b.leaderboard.mockRejectedValueOnce(new LeaderboardError('no such board', 404));
      b.send('lb', { id: 'l1', op: 'score', board: 'best', args: { score: 7 } });
      b.send('lb', { id: 'l2', op: 'description', board: 'none' });
      await Promise.resolve();
      await Promise.resolve();
      expect(b.leaderboard).toHaveBeenCalledWith('score', 'best', { score: 7 });
      expect(b.posted.map(p => p.payload)).toEqual([
        { id: 'l1', ok: true, result: { ok: true, best: 7 }, error: undefined, status: undefined },
        { id: 'l2', ok: false, result: null, error: 'no such board', status: 404 },
      ]);
    });
  });

  it('review requests are answered as unavailable', () => {
    t.send('review-request', { id: 'r1' });
    expect(t.posted).toEqual([{ type: 'review', payload: { id: 'r1', status: 'unavailable' } }]);
  });

  it('validates haptic patterns', () => {
    t.send('haptics', { pattern: 20 });
    t.send('haptics', { pattern: [20, 40, 20] });
    t.send('haptics', { pattern: [5000] });
    t.send('haptics', { pattern: 'buzz' });
    t.send('haptics', { pattern: [] });
    expect(t.vibrate.mock.calls).toEqual([[20], [[20, 40, 20]]]);
  });

  it('after destroy, nothing happens', () => {
    t.send('ad-request', { id: 'a1', format: 'interstitial' });
    t.bridge.destroy();
    t.advance(5000);
    t.send('ready');
    expect(t.ended).toEqual([]);
    expect(t.splash).toEqual([]);
  });
});
