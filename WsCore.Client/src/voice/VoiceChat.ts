import type WsClient from '../network/WsClient';
import type { IPlayer, VoiceIceServerConfig } from '../network/ClientEvents';
import { VoiceSignalKind } from '../network/ClientEvents';
import Emitter, { Unsubscribe } from '../utils/Emitter';

/** Where voice is: off, on the way in (microphone, server, reconnect), or in a channel. */
export type VoiceStatus = 'off' | 'connecting' | 'connected';

/**
 * Why voice stopped / could not start: our own codes for the microphone, the server's
 * `VoiceError` codes otherwise ("full", "banned", "moved", "removed"…).
 */
export type VoiceErrorCode =
  'mic_denied' | 'mic_missing' | 'mic_unavailable' | 'mic_lost' | 'insecure' | string;

/** The browser APIs voice needs — replaced in tests. */
export interface VoiceDeps {
  /** null when the page has no microphone API (an insecure context). */
  getUserMedia: ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | null;
  createPeerConnection(config: RTCConfiguration): RTCPeerConnection;
  /** An element playing a peer's audio (removed again with `remove()`). */
  createAudio(): HTMLAudioElement;
  /** For the "speaking" indicator; null = no indicator. */
  createAudioContext(): AudioContext | null;
  /** The machine's audio devices; absent = no device choice. */
  enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
  /** Subscribes to devices being plugged in / out; returns the unsubscribe. */
  onDeviceChange?: (listener: () => void) => () => void;
  /** `<audio>` can be sent to a chosen output (`setSinkId`; not in Safari). */
  canSelectOutput?: boolean;
  /** Where the chosen devices are remembered. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

/** A microphone or an output, as offered in the settings. */
export interface VoiceDevice {
  /** `deviceId`; '' = the system default. */
  id: string;
  label: string;
}

export interface VoiceDevices {
  inputs: VoiceDevice[];
  outputs: VoiceDevice[];
  /** Outputs can be chosen in this browser. */
  outputSelectable: boolean;
  /**
   * The browser named the devices. Before the microphone was allowed once it hides
   * them (no labels, often a single anonymous entry) — `requestDeviceAccess()` asks.
   */
  labelsKnown: boolean;
}

const INPUT_KEY = 'wscore.voiceInput';
const OUTPUT_KEY = 'wscore.voiceOutput';
/** Chrome's pseudo-devices, which only repeat a real one ("По умолчанию" covers them). */
const PSEUDO_DEVICES = new Set(['default', 'communications']);

type SinkAudio = HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };

export function browserVoiceDeps(): VoiceDeps {
  const media = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return {
    getUserMedia: media?.getUserMedia ? c => media.getUserMedia(c) : null,
    createPeerConnection: config => new RTCPeerConnection(config),
    createAudio: () => {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.hidden = true;
      document.body.appendChild(audio);
      return audio;
    },
    enumerateDevices: media?.enumerateDevices ? () => media.enumerateDevices() : undefined,
    onDeviceChange: listener => {
      media?.addEventListener?.('devicechange', listener);
      return () => media?.removeEventListener?.('devicechange', listener);
    },
    canSelectOutput:
      typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype,
    storage: (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })(),
    createAudioContext: () => {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      try {
        return Ctor ? new Ctor() : null;
      } catch {
        return null;
      }
    },
  };
}

type VoiceEvents = {
  /** Status, error, mute / deafen, who is speaking or the chosen devices changed. */
  change: () => void;
  /** A device was plugged in / out (the settings re-list them). */
  devices: () => void;
};

interface Peer {
  readonly clientId: number;
  readonly pc: RTCPeerConnection;
  /** We sent the offer (we joined after them) — also the side that restarts ICE. */
  readonly initiator: boolean;
  audio: HTMLAudioElement | null;
  /** Candidates that arrived before the remote description. */
  readonly pendingCandidates: RTCIceCandidateInit[];
  /** Signals are applied one at a time, in order. */
  queue: Promise<void>;
  closed: boolean;
}

interface Meter {
  readonly source: MediaStreamAudioSourceNode;
  readonly analyser: AnalyserNode;
  readonly samples: Uint8Array<ArrayBuffer>;
  lastLoudAt: number;
}

/** RMS level (0..1) above which someone counts as speaking, and how long that lasts. */
const SPEAKING_LEVEL = 0.025;
const SPEAKING_HOLD_MS = 350;
const METER_INTERVAL_MS = 100;

/**
 * Voice chat, Discord-style: independent of the text room shown, the user talks in at
 * most one voice channel. Owned by App, so it survives lobby ↔ game switches and
 * reconnects (it rejoins once the new connection identified).
 *
 * A WebRTC mesh: one RTCPeerConnection per other participant, signalled through the
 * server. Whoever joins later calls (offers to) everyone already there — the server
 * lists them in the join result — and is also the side that restarts ICE if the path
 * fails; everyone else answers. The roster (`WsClient.voiceRoster`) is the truth about
 * who is there: a peer that left it is hung up.
 *
 * The microphone is opened on join (a click — browsers want a gesture) and released on
 * leave, so the browser's "recording" indicator is on only while in voice.
 */
export default class VoiceChat<T extends IPlayer = IPlayer> {
  status: VoiceStatus = 'off';
  /** Why voice last stopped / failed to start (null = it did not). */
  error: VoiceErrorCode | null = null;
  muted = false;
  deafened = false;
  /** The chosen microphone ('' = the system default). */
  inputDeviceId: string;
  /** The chosen output ('' = the system default). */
  outputDeviceId: string;
  /** Client ids speaking right now (ours included). */
  readonly speaking = new Set<number>();

  private readonly emitter = new Emitter<VoiceEvents>();
  private readonly unsubs: Unsubscribe[];
  /** The channel the user wants to be in (kept across reconnects). */
  private wantedRoomId: string | null = null;
  /** The current connection has identified (voice needs a user). */
  private sessionReady: boolean;
  /** A join request is on its way. */
  private joinSent = false;
  private local: MediaStream | null = null;
  private iceServers: VoiceIceServerConfig[] = [];
  private readonly peers = new Map<number, Peer>();
  private audioContext: AudioContext | null = null;
  private readonly meters = new Map<number, Meter>();
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  /** Bumped by leave(): a microphone request that resolves afterwards is stale. */
  private joinSeq = 0;
  /** Bumped by every microphone switch: only the latest one is applied. */
  private inputSeq = 0;

  constructor(
    private readonly client: WsClient<T>,
    private readonly deps: VoiceDeps = browserVoiceDeps()
  ) {
    this.sessionReady = client.myUserId !== 0 && client.clientId >= 0;
    this.inputDeviceId = this.load(INPUT_KEY);
    this.outputDeviceId = deps.canSelectOutput ? this.load(OUTPUT_KEY) : '';
    this.unsubs = [
      deps.onDeviceChange?.(() => this.emitter.emit('devices')) ?? (() => {}),
      client.on('sessionInit', () => this.onSessionInit()),
      client.on('identified', () => this.onIdentified()),
      client.on('voiceJoined', (roomId, peers, ice) => this.onJoined(roomId, peers, ice)),
      client.on('voiceJoinFailed', (roomId, error) => this.onJoinFailed(roomId, error)),
      client.on('voiceLeft', (roomId, reason) => this.onLeft(roomId, reason)),
      client.on('voiceSignal', (from, kind, data) => this.onSignal(from, kind, data)),
      client.on('voiceRoster', () => this.onRoster()),
    ];
  }

  on<K extends keyof VoiceEvents>(event: K, fn: VoiceEvents[K]): Unsubscribe {
    return this.emitter.on(event, fn);
  }

  /** The voice channel we are in or on our way into (null = none). */
  get roomId(): string | null {
    return this.wantedRoomId;
  }

  /** Our own client id while in voice (to find us in the roster / `speaking`). */
  get selfClientId(): number {
    return this.client.clientId;
  }

  /** Talk in `roomId` (leaving any other voice channel). Call from a user gesture. */
  async join(roomId: string): Promise<void> {
    if (this.wantedRoomId === roomId && this.status !== 'off') return;
    const seq = ++this.joinSeq;
    this.closeAllPeers();
    this.wantedRoomId = roomId;
    this.error = null;
    this.status = 'connecting';
    this.joinSent = false;
    this.changed();

    // Created / resumed within the click, so autoplay rules let it run.
    if (!this.audioContext) this.audioContext = this.deps.createAudioContext();
    void this.audioContext?.resume?.().catch(() => {});

    if (!this.local) {
      const failure = await this.openMicrophone();
      if (seq !== this.joinSeq) return; // left (or joined elsewhere) meanwhile
      if (failure) {
        this.stop(failure);
        return;
      }
    }
    this.sendJoin();
  }

  /** Leave voice (hangs up everyone, releases the microphone). */
  leave(): void {
    if (this.wantedRoomId === null && this.status === 'off') return;
    this.joinSeq++;
    if (this.client.voiceRoomId || this.joinSent) this.client.leaveVoice();
    this.stop(null);
  }

  toggleMute(): void {
    // Unmuting while deafened also brings the sound back (as Discord does).
    if (this.deafened) this.setDeafened(false);
    else this.setMuted(!this.muted);
  }

  toggleDeafen(): void {
    this.setDeafened(!this.deafened);
  }

  setMuted(muted: boolean): void {
    if (this.deafened && !muted) return;
    this.muted = muted;
    this.applyLocalTrack();
    this.client.setVoiceState(this.muted, this.deafened);
    this.changed();
  }

  setDeafened(deafened: boolean): void {
    this.deafened = deafened;
    if (deafened) this.muted = true;
    else this.muted = false;
    this.applyLocalTrack();
    for (const peer of this.peers.values()) if (peer.audio) peer.audio.muted = deafened;
    this.client.setVoiceState(this.muted, this.deafened);
    this.changed();
  }

  // ==================== devices ====================

  /** The microphones and outputs to choose from. */
  async listDevices(): Promise<VoiceDevices> {
    const outputSelectable = !!this.deps.canSelectOutput;
    let all: MediaDeviceInfo[] = [];
    try {
      all = (await this.deps.enumerateDevices?.()) ?? [];
    } catch {
      all = [];
    }
    const pick = (kind: MediaDeviceKind, fallback: string): VoiceDevice[] => {
      const list = all.filter(
        d => d.kind === kind && d.deviceId && !PSEUDO_DEVICES.has(d.deviceId)
      );
      return list.map((d, i) => ({ id: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
    };
    const audio = all.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput');
    return {
      inputs: pick('audioinput', 'Микрофон'),
      outputs: outputSelectable ? pick('audiooutput', 'Динамики') : [],
      outputSelectable,
      labelsKnown: audio.some(d => d.label),
    };
  }

  /**
   * Asks for the microphone once, only so the browser names the devices; released at
   * once. Call from a click. Returns a `VoiceErrorCode` when refused.
   */
  async requestDeviceAccess(): Promise<VoiceErrorCode | null> {
    if (!this.deps.getUserMedia) return 'insecure';
    if (this.local) return null; // already open: the devices are named
    try {
      const stream = await this.deps.getUserMedia({ audio: true, video: false });
      for (const track of stream.getTracks()) track.stop();
      this.emitter.emit('devices');
      return null;
    } catch (e) {
      return microphoneError(e);
    }
  }

  /**
   * Talk through `deviceId` ('' = the system default). Remembered for next time; while
   * in voice the microphone is switched without hanging up (the peers get the new
   * track). Returns a `VoiceErrorCode` when the device could not be opened — the old
   * microphone then stays on.
   */
  async setInputDevice(deviceId: string): Promise<VoiceErrorCode | null> {
    const seq = ++this.inputSeq;
    const previous = this.inputDeviceId;
    this.inputDeviceId = deviceId;
    this.save(INPUT_KEY, deviceId);
    this.changed();
    if (!this.local || !this.deps.getUserMedia) return null; // used on the next join

    let stream: MediaStream;
    try {
      stream = await this.deps.getUserMedia(this.microphoneConstraints(true));
    } catch (e) {
      if (seq === this.inputSeq) {
        this.inputDeviceId = previous;
        this.save(INPUT_KEY, previous);
        this.changed();
      }
      return microphoneError(e);
    }
    const track = stream.getAudioTracks()[0];
    // Superseded by another switch, or voice stopped meanwhile.
    if (seq !== this.inputSeq || !this.local || !track) {
      for (const t of stream.getTracks()) t.stop();
      return track ? null : 'mic_missing';
    }
    const old = this.local;
    this.local = stream;
    this.watchTrack(track);
    this.applyLocalTrack();
    for (const peer of this.peers.values()) {
      const sender = peer.pc
        .getSenders?.()
        .find(s => s.track?.kind === 'audio' || s.track === null);
      if (sender) void sender.replaceTrack(track).catch(e => this.peerError(peer, e));
      else peer.pc.addTrack(track, stream);
    }
    for (const t of old.getTracks()) {
      t.onended = null;
      t.stop();
    }
    if (this.status === 'connected') this.watchLocalLevel();
    return null;
  }

  /**
   * Play the others through `deviceId` ('' = the system default); remembered. False
   * when the browser refused it (the device is gone) — the sound stays where it was.
   */
  async setOutputDevice(deviceId: string): Promise<boolean> {
    if (!this.deps.canSelectOutput) return false;
    const previous = this.outputDeviceId;
    this.outputDeviceId = deviceId;
    this.changed();
    const results = await Promise.all(
      [...this.peers.values()].map(p => (p.audio ? this.applySink(p.audio) : Promise.resolve(true)))
    );
    if (results.every(Boolean)) {
      this.save(OUTPUT_KEY, deviceId);
      return true;
    }
    this.outputDeviceId = previous;
    for (const p of this.peers.values()) if (p.audio) void this.applySink(p.audio);
    this.changed();
    return false;
  }

  /** Sends an `<audio>` element to the chosen output (also used by the settings' test sound). */
  async applySink(audio: HTMLAudioElement): Promise<boolean> {
    const sink = audio as SinkAudio;
    if (!this.deps.canSelectOutput || !sink.setSinkId) return true;
    if ((sink as { sinkId?: string }).sinkId === this.outputDeviceId) return true;
    try {
      await sink.setSinkId(this.outputDeviceId);
      return true;
    } catch {
      return false;
    }
  }

  /** A short chime through the chosen output, so the user hears where the sound goes. */
  async playTestSound(): Promise<boolean> {
    const audio = this.deps.createAudio();
    const url =
      typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(chime()) : '';
    const done = () => {
      audio.remove();
      if (url) URL.revokeObjectURL(url);
    };
    try {
      if (!(await this.applySink(audio))) throw new Error('sink');
      audio.src = url;
      audio.onended = done;
      await audio.play();
      return true;
    } catch {
      done();
      return false;
    }
  }

  private load(key: string): string {
    try {
      return this.deps.storage?.getItem(key) ?? '';
    } catch {
      return '';
    }
  }

  private save(key: string, value: string): void {
    try {
      if (value) this.deps.storage?.setItem(key, value);
      else this.deps.storage?.removeItem(key);
    } catch {
      // private mode / quota: the choice just is not remembered
    }
  }

  /** Final teardown (the app stops). */
  dispose(): void {
    this.leave();
    for (const off of this.unsubs) off();
    void this.audioContext?.close?.().catch(() => {});
    this.audioContext = null;
    this.emitter.clear();
  }

  // ==================== session ====================

  private onSessionInit(): void {
    // A new connection: the server forgot us (and the peers' client ids changed).
    this.sessionReady = false;
    this.joinSent = false;
    this.closeAllPeers();
    if (this.wantedRoomId && this.status === 'connected') {
      this.status = 'connecting';
      this.changed();
    }
  }

  private onIdentified(): void {
    this.sessionReady = true;
    if (this.wantedRoomId && this.local && !this.joinSent && this.status === 'connecting')
      this.sendJoin();
  }

  private sendJoin(): void {
    if (!this.wantedRoomId || !this.sessionReady || this.client.clientId < 0) return;
    this.joinSent = true;
    this.client.joinVoice(this.wantedRoomId);
  }

  private onJoined(roomId: string, peers: number[], iceServers: VoiceIceServerConfig[]): void {
    this.joinSent = false;
    if (roomId !== this.wantedRoomId) {
      // Left meanwhile: tell the server; joined elsewhere: that answer is still coming.
      if (this.wantedRoomId === null) this.client.leaveVoice();
      return;
    }
    this.iceServers = iceServers;
    this.status = 'connected';
    this.error = null;
    this.closeAllPeers();
    if (this.muted || this.deafened) this.client.setVoiceState(this.muted, this.deafened);
    for (const clientId of peers) {
      if (clientId !== this.client.clientId) this.createPeer(clientId, true);
    }
    this.watchLocalLevel();
    this.changed();
  }

  private onJoinFailed(roomId: string, error: string): void {
    this.joinSent = false;
    if (roomId !== this.wantedRoomId) return;
    this.stop(error);
  }

  private onLeft(roomId: string, reason: string): void {
    // Our own leave is already done; being taken out (another tab took over, access
    // lost, banned, channel deleted) stops voice here.
    if (reason === 'left' || roomId !== this.wantedRoomId) return;
    this.stop(reason);
  }

  private onRoster(): void {
    if (this.status !== 'connected' || !this.wantedRoomId) return;
    const present = new Set(this.client.voiceParticipants(this.wantedRoomId).map(p => p.clientId));
    for (const clientId of [...this.peers.keys()]) {
      if (!present.has(clientId)) this.closePeer(clientId);
    }
    // The roster says who is muted; redraw.
    this.changed();
  }

  /** Back to off: hang up, release the microphone; `error` says why (null = asked to). */
  private stop(error: VoiceErrorCode | null): void {
    this.closeAllPeers();
    this.releaseMicrophone();
    this.stopMeter(this.client.clientId);
    this.wantedRoomId = null;
    this.joinSent = false;
    this.status = 'off';
    this.error = error;
    this.changed();
  }

  // ==================== microphone ====================

  private async openMicrophone(): Promise<VoiceErrorCode | null> {
    if (!this.deps.getUserMedia) return 'insecure';
    try {
      // The chosen device if it is still there, else whatever the system offers.
      this.local = await this.deps.getUserMedia(this.microphoneConstraints(false));
    } catch (e) {
      return microphoneError(e);
    }
    const track = this.local.getAudioTracks()[0];
    if (!track) {
      this.releaseMicrophone();
      return 'mic_missing';
    }
    this.watchTrack(track);
    this.applyLocalTrack();
    return null;
  }

  /** `exact`: switching on purpose must fail rather than silently pick another device. */
  private microphoneConstraints(exact: boolean): MediaStreamConstraints {
    const audio: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    if (this.inputDeviceId)
      audio.deviceId = exact ? { exact: this.inputDeviceId } : { ideal: this.inputDeviceId };
    return { audio, video: false };
  }

  /** Unplugged / taken away by the system: voice stops. */
  private watchTrack(track: MediaStreamTrack): void {
    track.onended = () => {
      if (this.local?.getAudioTracks()[0] !== track) return;
      if (this.client.voiceRoomId) this.client.leaveVoice();
      this.stop('mic_lost');
    };
  }

  private releaseMicrophone(): void {
    for (const track of this.local?.getTracks() ?? []) {
      track.onended = null;
      track.stop();
    }
    this.local = null;
  }

  private applyLocalTrack(): void {
    for (const track of this.local?.getAudioTracks() ?? []) track.enabled = !this.muted;
  }

  // ==================== peers ====================

  private createPeer(clientId: number, initiator: boolean): Peer {
    this.closePeer(clientId);
    const pc = this.deps.createPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = {
      clientId,
      pc,
      initiator,
      audio: null,
      pendingCandidates: [],
      queue: Promise.resolve(),
      closed: false,
    };
    this.peers.set(clientId, peer);

    pc.onicecandidate = e => {
      if (!e.candidate || peer.closed) return;
      const init = e.candidate.toJSON ? e.candidate.toJSON() : e.candidate;
      this.client.sendVoiceSignal(clientId, VoiceSignalKind.Candidate, JSON.stringify(init));
    };
    pc.ontrack = e => this.attachRemote(peer, e.streams[0] ?? new MediaStream([e.track]));
    pc.oniceconnectionstatechange = () => {
      // The path broke (network change, NAT rebinding): the caller looks for a new one.
      if (pc.iceConnectionState === 'failed' && initiator && !peer.closed) pc.restartIce?.();
    };
    if (initiator) {
      // Fires after addTrack below, and again after restartIce().
      pc.onnegotiationneeded = () => {
        peer.queue = peer.queue
          .then(() => this.sendOffer(peer))
          .catch(e => this.peerError(peer, e));
      };
    }

    for (const track of this.local?.getAudioTracks() ?? []) pc.addTrack(track, this.local!);
    return peer;
  }

  private async sendOffer(peer: Peer): Promise<void> {
    if (peer.closed) return;
    const offer = await peer.pc.createOffer();
    if (peer.closed) return;
    await peer.pc.setLocalDescription(offer);
    const sdp = peer.pc.localDescription?.sdp ?? offer.sdp;
    if (!peer.closed && sdp) this.client.sendVoiceSignal(peer.clientId, VoiceSignalKind.Offer, sdp);
  }

  private onSignal(from: number, kind: VoiceSignalKind, data: string): void {
    if (this.status !== 'connected') return;
    let peer = this.peers.get(from);
    if (kind === VoiceSignalKind.Offer && (!peer || !peer.initiator)) {
      // A newcomer calling us (or the caller renegotiating / restarting ICE).
      peer ??= this.createPeer(from, false);
    }
    if (!peer) return;
    const target = peer;
    target.queue = target.queue
      .then(() => this.applySignal(target, kind, data))
      .catch(e => this.peerError(target, e));
  }

  private async applySignal(peer: Peer, kind: VoiceSignalKind, data: string): Promise<void> {
    if (peer.closed) return;
    const pc = peer.pc;
    switch (kind) {
      case VoiceSignalKind.Offer: {
        if (peer.initiator) return; // never both sides offering (see the class comment)
        await pc.setRemoteDescription({ type: 'offer', sdp: data });
        await this.flushCandidates(peer);
        const answer = await pc.createAnswer();
        if (peer.closed) return;
        await pc.setLocalDescription(answer);
        const sdp = pc.localDescription?.sdp ?? answer.sdp;
        if (!peer.closed && sdp)
          this.client.sendVoiceSignal(peer.clientId, VoiceSignalKind.Answer, sdp);
        break;
      }
      case VoiceSignalKind.Answer:
        if (!peer.initiator || pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription({ type: 'answer', sdp: data });
        await this.flushCandidates(peer);
        break;
      case VoiceSignalKind.Candidate: {
        const candidate = JSON.parse(data) as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(candidate);
        else peer.pendingCandidates.push(candidate);
        break;
      }
    }
  }

  private async flushCandidates(peer: Peer): Promise<void> {
    const candidates = peer.pendingCandidates.splice(0);
    for (const candidate of candidates) {
      if (peer.closed) return;
      await peer.pc.addIceCandidate(candidate).catch(() => {}); // a stale one: harmless
    }
  }

  private peerError(peer: Peer, error: unknown): void {
    if (!peer.closed) console.warn(`Voice: signalling with client ${peer.clientId} failed`, error);
  }

  private attachRemote(peer: Peer, stream: MediaStream): void {
    if (peer.closed) return;
    if (!peer.audio) {
      peer.audio = this.deps.createAudio();
      if (this.outputDeviceId) void this.applySink(peer.audio);
    }
    peer.audio.muted = this.deafened;
    if (peer.audio.srcObject !== stream) {
      peer.audio.srcObject = stream;
      void peer.audio.play?.()?.catch(() => {}); // autoplay: the join click allows it
      this.startMeter(peer.clientId, stream);
    }
  }

  private closePeer(clientId: number): void {
    const peer = this.peers.get(clientId);
    if (!peer) return;
    peer.closed = true;
    this.peers.delete(clientId);
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.oniceconnectionstatechange = null;
    peer.pc.close();
    if (peer.audio) {
      peer.audio.srcObject = null;
      peer.audio.remove();
    }
    this.stopMeter(clientId);
  }

  private closeAllPeers(): void {
    for (const clientId of [...this.peers.keys()]) this.closePeer(clientId);
  }

  // ==================== speaking indicator ====================

  private watchLocalLevel(): void {
    if (this.local) this.startMeter(this.client.clientId, this.local);
  }

  private startMeter(clientId: number, stream: MediaStream): void {
    this.stopMeter(clientId);
    const ctx = this.audioContext;
    if (!ctx || stream.getAudioTracks().length === 0) return;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser); // analysed only — the <audio> element plays it
      this.meters.set(clientId, {
        source,
        analyser,
        samples: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
        lastLoudAt: 0,
      });
    } catch {
      return; // no indicator for this one
    }
    this.meterTimer ??= setInterval(() => this.measure(), METER_INTERVAL_MS);
  }

  private stopMeter(clientId: number): void {
    const meter = this.meters.get(clientId);
    if (meter) {
      meter.source.disconnect();
      this.meters.delete(clientId);
    }
    if (this.speaking.delete(clientId)) this.changed();
    if (this.meters.size === 0 && this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }

  private measure(): void {
    const now = performance.now();
    let changed = false;
    for (const [clientId, meter] of this.meters) {
      meter.analyser.getByteTimeDomainData(meter.samples);
      let sum = 0;
      for (const v of meter.samples) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      const level = Math.sqrt(sum / meter.samples.length);
      const self = clientId === this.client.clientId;
      if (level > SPEAKING_LEVEL && !(self && this.muted)) meter.lastLoudAt = now;
      const speaking = now - meter.lastLoudAt < SPEAKING_HOLD_MS;
      if (speaking !== this.speaking.has(clientId)) {
        if (speaking) this.speaking.add(clientId);
        else this.speaking.delete(clientId);
        changed = true;
      }
    }
    if (changed) this.changed();
  }

  private changed(): void {
    this.emitter.emit('change');
  }
}

function microphoneError(e: unknown): VoiceErrorCode {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'mic_denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'mic_missing';
  return 'mic_unavailable';
}

/** Two soft notes (~0.6 s) as a 16-bit mono WAV. */
function chime(): Blob {
  const rate = 22050;
  const notes = [
    [660, 0, 0.3],
    [880, 0.25, 0.35],
  ];
  const length = Math.floor(rate * 0.6);
  const data = new Int16Array(length);
  for (const [freq, start, duration] of notes) {
    const from = Math.floor(start * rate);
    const count = Math.floor(duration * rate);
    for (let i = 0; i < count && from + i < length; i++) {
      const t = i / rate;
      const envelope = Math.min(1, t * 40) * Math.exp(-t * 8);
      data[from + i] += Math.round(Math.sin(2 * Math.PI * freq * t) * envelope * 9000);
    }
  }
  const buffer = new ArrayBuffer(44 + data.byteLength);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + data.byteLength, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, data.byteLength, true);
  new Int16Array(buffer, 44).set(data);
  return new Blob([buffer], { type: 'audio/wav' });
}
