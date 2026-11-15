import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WsConnection, { ServerEventType } from './WsConnection';
import { HeartbeatEvent } from './protocol/HeartbeatEvent';

// The watchdog drops a socket that has been silent (no message at all) for
// WATCHDOG_TIMEOUT_MS while 'open' into the normal reconnect path. Driven with fake
// timers + a fake WebSocket; the Vitest env has no DOM, so `document` is stubbed too.

class FakeSocket {
  static readonly OPEN = 1;
  static instances: FakeSocket[] = [];
  readonly url: string;
  readyState = 0;
  binaryType = '';
  closed = false;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  send(): void {}
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.({});
  }
  receive(frame: Uint8Array): void {
    this.onmessage?.({ data: frame.slice().buffer });
  }
}

function heartbeatFrame(): Uint8Array {
  const payload = HeartbeatEvent.serialize(new HeartbeatEvent());
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = ServerEventType.HeartbeatEvent;
  frame.set(payload, 1);
  return frame;
}

const TIMEOUT = WsConnection.WATCHDOG_TIMEOUT_MS;
let visibilityListener: (() => void) | null = null;
const doc = {
  location: { protocol: 'http:', port: '', hostname: 'localhost' },
  visibilityState: 'visible',
  addEventListener: (type: string, fn: () => void) => {
    if (type === 'visibilitychange') visibilityListener = fn;
  },
  removeEventListener: (type: string, fn: () => void) => {
    if (type === 'visibilitychange' && visibilityListener === fn) visibilityListener = null;
  },
};

function connectOpen(): { conn: WsConnection; socket: FakeSocket } {
  const conn = new WsConnection();
  conn.connect('ws://test/ws');
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  socket.open();
  return { conn, socket };
}

describe('WsConnection watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    FakeSocket.instances = [];
    visibilityListener = null;
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('document', doc);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('timeout is ~3 server heartbeats (5 s)', () => {
    expect(TIMEOUT).toBe(15000);
  });

  it('a silent open socket is dropped and goes through reconnect', () => {
    const { conn, socket } = connectOpen();
    expect(conn.connectionStatus).toBe('open');

    vi.advanceTimersByTime(TIMEOUT - 1000);
    expect(conn.connectionStatus).toBe('open');
    expect(socket.closed).toBe(false);

    vi.advanceTimersByTime(TIMEOUT); // well past the deadline
    expect(conn.connectionStatus).toBe('reconnecting');
    expect(socket.closed).toBe(true);
    // Detached: a late onclose from the dead socket can't trigger a second reconnect.
    expect(socket.onclose).toBeNull();
    expect(socket.onmessage).toBeNull();

    // The backoff timer opens a replacement socket.
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].open();
    expect(conn.connectionStatus).toBe('open');
  });

  it('heartbeats keep a quiet connection alive indefinitely', () => {
    const { conn, socket } = connectOpen();
    for (let t = 0; t < 120_000; t += 5000) {
      vi.advanceTimersByTime(5000);
      socket.receive(heartbeatFrame());
    }
    expect(conn.connectionStatus).toBe('open');
    expect(socket.closed).toBe(false);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('suspended timers (frozen tab / sleep) open a grace window instead of reconnecting', () => {
    const { conn, socket } = connectOpen();
    // The page was frozen for a minute: wall clock jumps, no timer ran meanwhile.
    vi.setSystemTime(Date.now() + 60_000);
    vi.advanceTimersByTime(TIMEOUT / 5); // first check after resume
    expect(conn.connectionStatus).toBe('open');
    expect(socket.closed).toBe(false);

    // The backlog arrives and traffic resumes: still fine.
    socket.receive(heartbeatFrame());
    vi.advanceTimersByTime(TIMEOUT - 1000);
    expect(conn.connectionStatus).toBe('open');

    // But a connection that stays silent after resuming is still detected.
    vi.advanceTimersByTime(TIMEOUT);
    expect(conn.connectionStatus).toBe('reconnecting');
  });

  it('becoming visible again resets the grace window', () => {
    const { conn } = connectOpen();
    vi.advanceTimersByTime(TIMEOUT - 2000);
    expect(visibilityListener).not.toBeNull();
    visibilityListener!();
    vi.advanceTimersByTime(TIMEOUT - 2000);
    expect(conn.connectionStatus).toBe('open');
  });

  it('an intentional disconnect stops the watchdog', () => {
    const { conn, socket } = connectOpen();
    conn.disconnect();
    vi.advanceTimersByTime(TIMEOUT * 4);
    expect(conn.connectionStatus).toBe('closed');
    expect(FakeSocket.instances).toHaveLength(1);
    expect(socket.closed).toBe(true);
    expect(visibilityListener).toBeNull();
  });

  it('a socket that closes normally stops its watchdog (one reconnect, not two)', () => {
    const { conn, socket } = connectOpen();
    socket.onclose!({ code: 1006 });
    expect(conn.connectionStatus).toBe('reconnecting');
    vi.advanceTimersByTime(TIMEOUT * 2); // reconnect fires; new socket never opens
    expect(FakeSocket.instances.length).toBeGreaterThanOrEqual(2);
    expect(FakeSocket.instances[0].closed).toBe(false); // watchdog never touched it
  });
});
