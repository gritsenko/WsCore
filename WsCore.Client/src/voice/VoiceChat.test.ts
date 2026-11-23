import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WsClient from '../network/WsClient';
import { InitPlayerEvent } from '../network/protocol/InitPlayerEvent';
import { PresenceSnapshotEvent } from '../network/protocol/PresenceSnapshotEvent';
import { VoiceJoinResultEvent } from '../network/protocol/VoiceJoinResultEvent';
import { VoiceIceServer } from '../network/protocol/VoiceIceServer';
import { VoiceLeftEvent } from '../network/protocol/VoiceLeftEvent';
import { VoiceSignalEvent } from '../network/protocol/VoiceSignalEvent';
import { VoiceRosterEvent } from '../network/protocol/VoiceRosterEvent';
import { VoiceRoomInfo } from '../network/protocol/VoiceRoomInfo';
import { VoiceParticipantInfo } from '../network/protocol/VoiceParticipantInfo';
import { VoiceSignalKind } from '../network/ClientEvents';
import VoiceChat, { VoiceDeps } from './VoiceChat';

// VoiceChat runs the WebRTC mesh; the browser's RTCPeerConnection / microphone are
// replaced by fakes that record what was done to them.

class FakePeerConnection {
  static all: FakePeerConnection[] = [];
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  localDescription: { type: string; sdp: string } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  signalingState = 'stable';
  iceConnectionState = 'new';
  tracks: unknown[] = [];
  candidates: unknown[] = [];
  closed = false;
  restarts = 0;

  constructor(readonly config: RTCConfiguration) {
    FakePeerConnection.all.push(this);
  }
  addTrack(track: unknown): void {
    this.tracks.push(track);
    queueMicrotask(() => this.onnegotiationneeded?.());
  }
  async createOffer() {
    return { type: 'offer', sdp: `offer-${this.restarts}` };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer' };
  }
  async setLocalDescription(d: { type: string; sdp: string }) {
    this.localDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-local-offer' : 'stable';
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d;
    this.signalingState = d.type === 'offer' ? 'have-remote-offer' : 'stable';
  }
  async addIceCandidate(c: unknown) {
    this.candidates.push(c);
  }
  restartIce(): void {
    this.restarts++;
    queueMicrotask(() => this.onnegotiationneeded?.());
  }
  close(): void {
    this.closed = true;
  }
}

function fakeMicrophone() {
  const track = { enabled: true, stopped: false, onended: null as null | (() => void) };
  const stop = () => {
    track.stopped = true;
  };
  const stream = {
    getAudioTracks: () => [Object.assign(track, { stop })],
    getTracks: () => [Object.assign(track, { stop })],
  };
  return { track, stream: stream as unknown as MediaStream };
}

const last = <T>(list: T[]): T | undefined => list[list.length - 1];

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('VoiceChat', () => {
  let client: WsClient;
  let mic: ReturnType<typeof fakeMicrophone>;
  let getUserMedia: ReturnType<typeof vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>>;
  let deps: VoiceDeps;
  let sent: {
    join: string[];
    leave: number;
    signals: [number, number, string][];
    state: [boolean, boolean][];
  };

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    FakePeerConnection.all = [];
    client = new WsClient();
    mic = fakeMicrophone();
    getUserMedia = vi.fn(async (_c: MediaStreamConstraints) => mic.stream);
    deps = {
      getUserMedia,
      createPeerConnection: config =>
        new FakePeerConnection(config) as unknown as RTCPeerConnection,
      createAudio: () =>
        ({
          muted: false,
          srcObject: null,
          play: async () => {},
          remove() {},
        }) as unknown as HTMLAudioElement,
      createAudioContext: () => null,
    };
    sent = { join: [], leave: 0, signals: [], state: [] };
    vi.spyOn(client, 'sendVoiceJoinRequest').mockImplementation(id => void sent.join.push(id));
    vi.spyOn(client, 'sendVoiceLeaveRequest').mockImplementation(() => void sent.leave++);
    vi.spyOn(client, 'sendVoiceSignalRequest').mockImplementation(
      (to, kind, data) => void sent.signals.push([to, kind, data])
    );
    vi.spyOn(client, 'sendVoiceStateRequest').mockImplementation(
      (muted, deafened) => void sent.state.push([muted, deafened])
    );
  });
  afterEach(() => vi.restoreAllMocks());

  function connect(clientId = 3): void {
    const init = new InitPlayerEvent();
    init.clientId = clientId;
    client.onInitPlayerEvent(init);
    const snapshot = new PresenceSnapshotEvent();
    snapshot.yourUserId = 1;
    snapshot.users = [];
    client.onPresenceSnapshotEvent(snapshot);
  }

  function joined(roomId: string, peers: number[]): void {
    const e = new VoiceJoinResultEvent();
    e.roomId = roomId;
    e.success = true;
    e.peers = peers;
    const stun = new VoiceIceServer();
    stun.urls = ['stun:stun.example.com'];
    const turn = new VoiceIceServer();
    turn.urls = ['turn:turn.example.com'];
    turn.username = '123:1';
    turn.credential = 'secret';
    e.iceServers = [stun, turn];
    client.onVoiceJoinResultEvent(e);
  }

  function signal(from: number, kind: VoiceSignalKind, data: string): void {
    const e = new VoiceSignalEvent();
    e.fromClientId = from;
    e.kind = kind;
    e.data = data;
    client.onVoiceSignalEvent(e);
  }

  function roster(roomId: string, clientIds: number[]): void {
    const e = new VoiceRosterEvent();
    const room = new VoiceRoomInfo();
    room.roomId = roomId;
    room.participants = clientIds.map(id => {
      const p = new VoiceParticipantInfo();
      p.clientId = id;
      p.userId = id;
      return p;
    });
    e.rooms = [room];
    client.onVoiceRosterEvent(e);
  }

  it('opens the microphone, joins, and calls everyone already in the channel', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(sent.join).toEqual(['voice']);
    expect(voice.status).toBe('connecting');

    joined('voice', [5, 6]);
    expect(voice.status).toBe('connected');
    expect(FakePeerConnection.all).toHaveLength(2);
    expect(FakePeerConnection.all[0].config.iceServers).toEqual([
      { urls: ['stun:stun.example.com'] },
      { urls: ['turn:turn.example.com'], username: '123:1', credential: 'secret' },
    ]);
    expect(FakePeerConnection.all[0].tracks).toEqual([mic.track]);

    await flush();
    expect(sent.signals).toEqual([
      [5, VoiceSignalKind.Offer, 'offer-0'],
      [6, VoiceSignalKind.Offer, 'offer-0'],
    ]);

    // The answer and candidates complete the call; early candidates wait for it.
    const pc5 = FakePeerConnection.all[0];
    signal(5, VoiceSignalKind.Candidate, '{"candidate":"c1"}');
    signal(5, VoiceSignalKind.Answer, 'answer-5');
    await flush();
    expect(pc5.remoteDescription).toEqual({ type: 'answer', sdp: 'answer-5' });
    expect(pc5.candidates).toEqual([{ candidate: 'c1' }]);

    // Our own candidates go to that peer.
    pc5.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'mine' }) } });
    expect(last(sent.signals)).toEqual([5, VoiceSignalKind.Candidate, '{"candidate":"mine"}']);
  });

  it('waits for the identify before joining (a fresh page / a login)', async () => {
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    expect(sent.join).toEqual([]);
    connect();
    expect(sent.join).toEqual(['voice']);
  });

  it('answers a newcomer calling us', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    joined('voice', []);

    signal(7, VoiceSignalKind.Offer, 'offer-7');
    signal(7, VoiceSignalKind.Candidate, '{"candidate":"c7"}');
    await flush();
    const pc7 = FakePeerConnection.all[0];
    expect(pc7.remoteDescription).toEqual({ type: 'offer', sdp: 'offer-7' });
    expect(pc7.tracks).toEqual([mic.track]); // our audio goes back in the answer
    expect(pc7.candidates).toEqual([{ candidate: 'c7' }]);
    // Only the answer: the answering side never offers.
    expect(sent.signals).toEqual([[7, VoiceSignalKind.Answer, 'answer']]);
  });

  it('the caller restarts ICE when the path fails', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    joined('voice', [5]);
    await flush();
    const pc = FakePeerConnection.all[0];
    signal(5, VoiceSignalKind.Answer, 'a');
    await flush();

    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange?.();
    await flush();
    expect(last(sent.signals)).toEqual([5, VoiceSignalKind.Offer, 'offer-1']);
  });

  it('hangs up on whoever left the roster', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    joined('voice', [5, 6]);
    roster('voice', [3, 6]);
    expect(FakePeerConnection.all[0].closed).toBe(true);
    expect(FakePeerConnection.all[1].closed).toBe(false);
  });

  it('mute and deafen: the track is silenced and everyone is told', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    joined('voice', []);

    voice.toggleMute();
    expect(mic.track.enabled).toBe(false);
    expect(last(sent.state)).toEqual([true, false]);

    voice.toggleMute();
    expect(mic.track.enabled).toBe(true);

    voice.toggleDeafen();
    expect(voice.muted).toBe(true);
    expect(mic.track.enabled).toBe(false);
    expect(last(sent.state)).toEqual([true, true]);
    // Unmuting while deafened brings both back.
    voice.toggleMute();
    expect([voice.muted, voice.deafened]).toEqual([false, false]);
  });

  it('a refused microphone stops voice without joining', async () => {
    connect();
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    expect(voice.status).toBe('off');
    expect(voice.error).toBe('mic_denied');
    expect(sent.join).toEqual([]);

    const insecure = new VoiceChat(client, { ...deps, getUserMedia: null });
    await insecure.join('voice');
    expect(insecure.error).toBe('insecure');
  });

  it('leaving hangs up and releases the microphone', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    joined('voice', [5]);
    voice.leave();
    expect(sent.leave).toBe(1);
    expect(mic.track.stopped).toBe(true);
    expect(FakePeerConnection.all[0].closed).toBe(true);
    expect(voice.status).toBe('off');
    expect(voice.error).toBeNull();
  });

  it('being taken out by the server stops voice and says why', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    joined('voice', [5]);
    const left = new VoiceLeftEvent();
    left.roomId = 'voice';
    left.reason = 'moved';
    client.onVoiceLeftEvent(left);
    expect(voice.status).toBe('off');
    expect(voice.error).toBe('moved');
    expect(mic.track.stopped).toBe(true);
  });

  it('rejoins after a reconnect and calls the channel again', async () => {
    connect(3);
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    joined('voice', [5]);
    const old = FakePeerConnection.all[0];

    connect(4); // a new connection: new client id, the server forgot us
    expect(old.closed).toBe(true);
    expect(sent.join).toEqual(['voice', 'voice']);
    expect(voice.status).toBe('connecting');
    expect(getUserMedia).toHaveBeenCalledOnce(); // the microphone stayed open

    joined('voice', [8]);
    expect(voice.status).toBe('connected');
    expect(FakePeerConnection.all).toHaveLength(2);
  });

  it('a join refused by the server is reported', async () => {
    connect();
    const voice = new VoiceChat(client, deps);
    await voice.join('voice');
    const refused = new VoiceJoinResultEvent();
    refused.roomId = 'voice';
    refused.success = false;
    refused.error = 'full';
    client.onVoiceJoinResultEvent(refused);
    expect(voice.status).toBe('off');
    expect(voice.error).toBe('full');
    expect(mic.track.stopped).toBe(true);
  });
});
