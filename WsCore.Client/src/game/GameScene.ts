import * as THREE from 'three';
import { ModerationAction, describeModerationError } from '../network/Permissions';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as Common from '../utils/Common';
import Keyboard, { KeyHandle, isEditableTarget } from '../utils/Keyboard';
import { isClickGesture, PointerSample } from '../utils/Pointer';
import ChatUI from '../utils/ChatUI';
import WsClient from '../network/WsClient';
import { Unsubscribe } from '../utils/Emitter';
import World from './World';
import Player from './Player';
import PlayerView from './PlayerView';

/**
 * The 3D game state. Renders players/world over the shared, session-long WsClient.
 * Created on entering the game room, torn down on leaving. All subscriptions,
 * listeners, RAF and GPU resources are released in exit() so 10+ enter/exit
 * cycles leak nothing (audit §4.2, 4.4–4.7).
 */
export default class GameScene {
  private client: WsClient<Player>;
  /** The spatial room this scene shows (from the server's room list). */
  private readonly roomId: string;
  private readonly onLeave: () => void;
  /** Our join of the game room has been confirmed in this session. */
  private inRoom = false;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private world = new World();
  private chatUI: ChatUI | null = null;

  private views = new Map<number, PlayerView>();
  private unsubs: Unsubscribe[] = [];
  private keyHandles: KeyHandle[] = [];

  // Smoothed orbit target, dragged toward myPlayer each frame so the camera
  // trails the player while preserving whatever orbit/zoom the user set.
  private cameraTarget = new THREE.Vector3(0, 50, 0);

  /** Camera-follow decay rate (1/s): matches the old per-frame lerp(…, 0.09) at 60 Hz. */
  private static readonly CAMERA_SMOOTHING = Common.rateFromPerFrameLerp(0.09, 60);

  /** RAF timestamp of the previous frame (ms); 0 = no frame yet. */
  private lastFrameMs = 0;

  /** Primary-button pointerdown on the canvas, pending a click-vs-drag decision. */
  private pointerDown: (PointerSample & { id: number }) | null = null;

  private rafId = 0;
  private running = false;
  private backButton: HTMLElement | null = null;

  constructor(client: WsClient<Player>, roomId: string, onLeave: () => void) {
    this.client = client;
    this.roomId = roomId;
    this.onLeave = onLeave;
  }

  enter(): void {
    this.chatUI = new ChatUI();
    this.chatUI.setOnMessageCallback(message => this.client.sendChatMessageRequest(message));

    this.initThree();
    this.initInput();

    // Subscribe before any players arrive so none are missed.
    this.unsubs.push(
      this.client.on('playerCreate', (p: Player) => this.addView(p)),
      this.client.on('playerRemove', (p: Player) => this.removeView(p.id)),
      this.client.on('mapObjects', objs => this.world.updateMapObjects(objs)),
      this.client.on('chat', (roomId, entry) => {
        if (roomId === this.roomId) this.chatUI?.addMessage(entry.name, entry.text);
      }),
      this.client.on('chatHistory', (roomId, change) => {
        if (roomId !== this.roomId) return;
        // Catch-ups are appended; a replaced log is redrawn. (The overlay shows only the
        // recent tail, so older pages are never requested here.)
        if (change.kind === 'append') {
          for (const entry of change.entries) this.chatUI?.addMessage(entry.name, entry.text);
        } else if (change.kind === 'reset') {
          this.showRecentChat();
        }
      }),
      this.client.on('chatDeleted', roomId => {
        if (roomId === this.roomId) this.showRecentChat();
      }),
      this.client.on('moderation', result => {
        // A refused chat message (muted / no links here): say why in the overlay.
        if (result.action === ModerationAction.SendMessage && !result.success)
          this.chatUI?.addMessage('—', describeModerationError(result.error));
      }),
      this.client.on('roomJoined', roomId => this.onRoomJoined(roomId)),
      this.client.on('roomJoinFailed', roomId => this.onRoomJoinFailed(roomId))
    );

    // Assets load async; the RAF loop and world start once they're ready.
    this.loadAssets(() => {
      // Back-to-lobby before textures finish would otherwise build the world / start
      // RAF on an already-disposed scene. renderer is nulled in exit(), so use it as
      // the "still alive" sentinel and no-op the late callback.
      if (!this.renderer) return;
      PlayerView.preload(new THREE.TextureLoader());
      this.world.create(this.scene);
      this.running = true;
      this.lastFrameMs = 0;
      this.animate(performance.now());
    });

    this.createBackButton();
  }

  /**
   * Runs after clientId is assigned: first connect, reconnect, or a lobby→game
   * switch. Asks to join the game room; the players arrive once the server confirms
   * (JoinRoomResult → GameStateUpdate → `playerCreate` per player, `myPlayer` set for
   * our own avatar). Views for already-known players are built now (normally none:
   * the client drops all players whenever it is outside the game world).
   */
  onSessionInit(): void {
    this.inRoom = false; // a new session starts in the home room until the join is confirmed
    this.client.joinRoom(this.roomId);
    this.buildExistingViews();
  }

  private onRoomJoined(roomId: string): void {
    if (roomId !== this.roomId) {
      // Moved out of the world by the server after we were in it (banned from the
      // channel): the scene has nothing left to show. (A join of another room before
      // ours was confirmed is the server's automatic home-room join on connect.)
      if (this.inRoom) this.onLeave();
      return;
    }
    this.inRoom = true;
    // The map is game-world state: fetch it once we're confirmed in the world.
    this.client.sendGetMapObjectsRequest(0, 0);
    // Whatever is cached of this room's chat is shown right away; the client is
    // already fetching what was missed.
    this.showRecentChat();
  }

  private showRecentChat(): void {
    this.chatUI?.setMessages(this.client.getChatLog(this.roomId).entries);
  }

  private onRoomJoinFailed(roomId: string): void {
    // E.g. the room no longer exists after a server restart: no dead end — back to
    // the lobby.
    if (roomId !== this.roomId) return;
    console.warn(`GameScene: could not join "${roomId}", returning to the lobby`);
    this.onLeave();
  }

  exit(): void {
    // 1. Stop the RAF loop FIRST so no frame renders a half-disposed scene.
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.lastFrameMs = 0;

    // 2. Detach client subscriptions — a live closure would pin this whole scene.
    for (const off of this.unsubs) off();
    this.unsubs = [];

    // 3. Remove input listeners.
    for (const k of this.keyHandles) Keyboard.removeHandler(k);
    this.keyHandles = [];
    window.removeEventListener('resize', this.onResize);
    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('pointerdown', this.onPointerDown);
      canvas.removeEventListener('pointerup', this.onPointerUp);
      canvas.removeEventListener('pointercancel', this.onPointerCancel);
    }
    this.pointerDown = null;
    document.removeEventListener('keydown', this.onKeyDown);

    // 4. Player visuals.
    for (const view of this.views.values()) view.detach();
    this.views.clear();

    // 5. World (ground geometry/material/texture, lights, objects).
    this.world.dispose();

    // 6. OrbitControls (holds canvas/document listeners).
    this.controls?.dispose();
    this.controls = null;

    // 7. Back button DOM node (by stored ref — the old style-selector never matched).
    this.backButton?.remove();
    this.backButton = null;

    // 8. Chat overlay.
    this.chatUI?.destroy();
    this.chatUI = null;

    // 9. Renderer LAST: detach canvas, dispose, and force context loss so the
    //    browser's ~16-WebGL-context limit isn't hit over many cycles.
    if (this.renderer) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    this.scene = null as any;
  }

  // ==================== players ====================

  private addView(player: Player): void {
    if (this.views.has(player.id)) return;
    const view = new PlayerView(player);
    view.attach(this.scene);
    this.views.set(player.id, view);
  }

  private removeView(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    view.detach();
    this.views.delete(id);
  }

  private buildExistingViews(): void {
    for (const id in this.client.players) {
      this.addView(this.client.players[id]);
    }
  }

  // ==================== three.js ====================

  private initThree(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfbf0e4);

    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    this.camera.position.set(0, 800, 800);
    this.camera.lookAt(0, 0, 0);

    const view = document.getElementById('game')!;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    // Cap at 2: 3x+ displays would triple fill-rate cost for no visible gain.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    view.appendChild(this.renderer.domElement);
    view.style.position = 'absolute';
    view.style.top = '0';
    view.style.left = '0';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.cameraTarget);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 3000;
    this.controls.maxPolarAngle = Math.PI / 2.1;
  }

  private loadAssets(callback: () => void): void {
    const textureLoader = new THREE.TextureLoader();
    let loaded = 0;
    const total = 4;
    const onLoad = () => {
      if (++loaded === total) callback();
    };
    textureLoader.load('/map/ground/Ground.png', onLoad, undefined, onLoad);
    textureLoader.load('/map/objects/trees/tree_1.png', onLoad, undefined, onLoad);
    textureLoader.load('/map/objects/trees/tree_2.png', onLoad, undefined, onLoad);
    textureLoader.load('/knight/01_idle_sword.png', onLoad, undefined, onLoad);
  }

  private animate = (nowMs: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.animate);

    // Delta time in seconds, clamped so a long gap (backgrounded tab) doesn't jump.
    const dt = this.lastFrameMs ? Common.frameDeltaSeconds(nowMs, this.lastFrameMs) : 0;
    this.lastFrameMs = nowMs;

    // Snapshot interpolation: remote avatars are drawn a bit in the past (between two
    // received snapshots); our own avatar with a shorter delay, for responsiveness.
    const clock = this.client.serverClock;
    const serverNow = clock.synced ? clock.now(nowMs) : NaN;
    const remoteT = serverNow - clock.remoteDelayMs();
    const localT = serverNow - clock.localDelayMs();
    const me = this.client.myPlayer;
    for (const [id, view] of this.views) view.update(dt, me?.id === id ? localT : remoteT);

    const p = me;
    if (p && this.controls) {
      const t = Common.smoothingFactor(GameScene.CAMERA_SMOOTHING, dt);
      const nextX = Common.lerp(this.cameraTarget.x, p.renderX, t);
      const nextZ = Common.lerp(this.cameraTarget.z, p.renderY, t);
      // Shift the camera by the same delta as the target so the orbit
      // radius/angle the user set is preserved — a pure translation, not
      // just a re-aim (setting .target alone only swivels the camera).
      this.camera.position.x += nextX - this.cameraTarget.x;
      this.camera.position.z += nextZ - this.cameraTarget.z;
      this.cameraTarget.x = nextX;
      this.cameraTarget.z = nextZ;
      this.controls.target.copy(this.cameraTarget);
    }
    this.controls?.update();
    this.world.update();

    if (this.renderer) this.renderer.render(this.scene, this.camera);
  };

  // ==================== input ====================

  private initInput(): void {
    this.initKey(Keyboard.KEY_UP, Keyboard.KEY_UP_MASK_OFFSET);
    this.initKey(Keyboard.KEY_DOWN, Keyboard.KEY_DOWN_MASK_OFFSET);
    this.initKey(Keyboard.KEY_LEFT, Keyboard.KEY_LEFT_MASK_OFFSET);
    this.initKey(Keyboard.KEY_RIGHT, Keyboard.KEY_RIGHT_MASK_OFFSET);

    window.addEventListener('resize', this.onResize);
    // Click-to-move listens on the canvas only (not document), so clicks on the chat
    // overlay / Back button don't send a move target; pointerdown/up lets us tell a
    // click from the end of an OrbitControls camera drag.
    const canvas = this.renderer!.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerCancel);
    document.addEventListener('keydown', this.onKeyDown);
  }

  private initKey(keyCode: number, maskBit: number): void {
    const key = Keyboard.addHandler(keyCode);
    key.press = () => {
      const p = this.client.myPlayer;
      if (!p) return; // no local player yet / during reconnect (audit §4.3)
      p.controls = Common.setBit(p.controls, maskBit);
      this.client.sendUpdatePlayerStateRequest(p.ax, p.ay, p.controls);
    };
    key.release = () => {
      const p = this.client.myPlayer;
      if (!p) return;
      p.controls = Common.clearBit(p.controls, maskBit);
      this.client.sendUpdatePlayerStateRequest(p.ax, p.ay, p.controls);
    };
    this.keyHandles.push(key);
  }

  private onResize = (): void => {
    if (!this.renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || !e.isPrimary) {
      // A second finger / other button means a camera gesture, not a click.
      this.pointerDown = null;
      return;
    }
    this.pointerDown = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
  };

  private onPointerUp = (e: PointerEvent): void => {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || down.id !== e.pointerId || e.button !== 0) return;
    if (!isClickGesture(down, { x: e.clientX, y: e.clientY, t: e.timeStamp })) return;
    this.moveToScreenPoint(e);
  };

  private onPointerCancel = (): void => {
    this.pointerDown = null;
  };

  private moveToScreenPoint(e: { clientX: number; clientY: number }): void {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, point)) {
      this.client.sendUpdatePlayerTargetRequest(point.x, point.z);
    }
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyE' && e.code !== 'KeyQ') return;
    if (isEditableTarget(e.target)) return; // typing "e"/"q" in chat
    const cursor = new THREE.Vector3();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    if (!raycaster.ray.intersectPlane(groundPlane, cursor)) return;

    const gridX = Math.floor(cursor.x / World.cellSize);
    const gridY = Math.floor(cursor.z / World.cellSize);
    if (e.code === 'KeyE') {
      this.client.sendSetMapObjectRequest(gridX, gridY, Math.floor(Math.random() * 2));
    } else {
      this.client.sendDestroyMapObjectRequest(gridX, gridY);
    }
  };

  private createBackButton(): void {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.left = '20px';
    container.style.zIndex = '10000';
    container.style.pointerEvents = 'auto';

    const button = document.createElement('div');
    button.style.background = 'rgba(44, 47, 51, 0.8)';
    button.style.border = '2px solid #4a9eff';
    button.style.borderRadius = '4px';
    button.style.padding = '8px 16px';
    button.style.cursor = 'pointer';
    button.style.transition = 'all 0.2s';
    button.style.fontFamily = 'Arial, sans-serif';
    button.style.fontSize = '12px';
    button.style.color = '#4a9eff';
    button.style.fontWeight = '600';
    button.textContent = 'Back to Lobby';
    button.addEventListener(
      'mouseenter',
      () => (button.style.background = 'rgba(64, 68, 75, 0.9)')
    );
    button.addEventListener(
      'mouseleave',
      () => (button.style.background = 'rgba(44, 47, 51, 0.8)')
    );
    button.addEventListener('click', () => this.onLeave());

    container.appendChild(button);
    document.body.appendChild(container);
    this.backButton = container;
  }
}
