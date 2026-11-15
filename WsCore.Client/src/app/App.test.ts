import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The Vitest env has no DOM: App only touches it for the connection banner, so a
// duck-typed stub is enough. LobbyState / GameScene are replaced by fakes that
// record their lifecycle; the GameScene module load is gated so the test controls
// exactly when the lazy chunk "arrives".

type Fake = { kind: string; calls: string[] };
const created: Fake[] = [];
let lobbyPlay: ((roomId: string) => void) | null = null;

vi.mock('./LobbyState', () => ({
  default: class {
    rec: Fake = { kind: 'lobby', calls: [] };
    constructor(_client: unknown, onEnterGame: (roomId: string) => void) {
      created.push(this.rec);
      lobbyPlay = onEnterGame;
    }
    enter() {
      this.rec.calls.push('enter');
    }
    onSessionInit() {
      this.rec.calls.push('sessionInit');
    }
    exit() {
      this.rec.calls.push('exit');
    }
  },
}));

let releaseChunk: () => void = () => {};
let chunkGate = new Promise<void>(r => (releaseChunk = r));
let sceneLeave: (() => void) | null = null;

vi.mock('../game/GameScene', async () => {
  await chunkGate;
  return {
    default: class {
      rec: Fake = { kind: 'game', calls: [] };
      constructor(_client: unknown, roomId: string, onLeave: () => void) {
        this.rec.calls.push(`room:${roomId}`);
        created.push(this.rec);
        sceneLeave = onLeave;
      }
      enter() {
        this.rec.calls.push('enter');
      }
      onSessionInit() {
        this.rec.calls.push('sessionInit');
      }
      exit() {
        this.rec.calls.push('exit');
      }
    },
  };
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise(r => setTimeout(r, 0));
};

describe('App lazy game loading', () => {
  beforeEach(() => {
    created.length = 0;
    lobbyPlay = null;
    sceneLeave = null;
    vi.stubGlobal('document', {
      createElement: () => ({ style: {} }),
      body: { appendChild: () => {} },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Runs first: the GameScene module is still gated (not yet loaded).
  it('creates the scene once even if Play is clicked repeatedly while loading', async () => {
    const { default: App } = await import('./App');
    const app = new App('ws://unused');
    app.start = () => (app as any).enterLobby(); // don't open a socket
    app.start();

    expect(created.map(c => c.kind)).toEqual(['lobby']);
    lobbyPlay!('game');
    lobbyPlay!('game');
    lobbyPlay!('game');
    await flush();
    // Still loading: no scene yet, lobby still active.
    expect(created.map(c => c.kind)).toEqual(['lobby']);
    expect(created[0].calls).toEqual(['enter']);

    releaseChunk();
    await flush();
    expect(created.map(c => c.kind)).toEqual(['lobby', 'game']);
    expect(created[0].calls).toEqual(['enter', 'exit']);
    // The scene is built for the room whose Play was clicked.
    expect(created[1].calls).toEqual(['room:game', 'enter']);

    // Back to lobby, Play again: the cached module still yields exactly one scene.
    sceneLeave!();
    lobbyPlay!('game');
    lobbyPlay!('game');
    await flush();
    expect(created.map(c => c.kind)).toEqual(['lobby', 'game', 'lobby', 'game']);
    expect(created[1].calls).toEqual(['room:game', 'enter', 'exit']);
    expect(created[3].calls).toEqual(['room:game', 'enter']);
  });

  it('drops a load that completes after another transition happened', async () => {
    chunkGate = Promise.resolve();
    const { default: App } = await import('./App');
    const app = new App('ws://unused');
    (app as any).enterLobby();

    lobbyPlay!('game');
    // A transition lands in the async gap (e.g. a future lobby re-entry).
    (app as any).enterLobby();
    await flush();

    expect(created.map(c => c.kind)).toEqual(['lobby', 'lobby']);

    // The guard resets: a fresh Play works.
    lobbyPlay!('game');
    await flush();
    expect(created.map(c => c.kind)).toEqual(['lobby', 'lobby', 'game']);
  });

  it('routes sessionInit to the lobby while the game chunk is loading', async () => {
    const { default: App } = await import('./App');
    const app = new App('ws://unused');
    (app as any).enterLobby();
    lobbyPlay!('game');
    // Reconnect fires before the chunk resolves (synchronously, ahead of the import).
    (app as any).client.emitter.emit('sessionInit');
    await flush();

    expect(created[0].calls).toEqual(['enter', 'sessionInit', 'exit']);
    expect(created[1].kind).toBe('game');
  });
});
