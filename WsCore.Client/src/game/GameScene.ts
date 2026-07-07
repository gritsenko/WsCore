import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as Common from '../utils/Common';
import Keyboard, { KeyHandle } from '../utils/Keyboard';
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
  private readonly onLeave: () => void;

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private world = new World();
  private chatUI: ChatUI | null = null;

  private views = new Map<number, PlayerView>();
  private unsubs: Unsubscribe[] = [];
  private keyHandles: KeyHandle[] = [];

  private rafId = 0;
  private running = false;
  private backButton: HTMLElement | null = null;

  constructor(client: WsClient<Player>, onLeave: () => void) {
    this.client = client;
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
      this.client.on('chat', (name, text) => this.chatUI?.addMessage(name, text))
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
      this.animate();
    });

    this.createBackButton();
  }

  /**
   * Runs after clientId is assigned: first connect, reconnect, or a lobby→game
   * switch. Joins the game room, (re)fetches the map, and builds views for any
   * already-known players (on reconnect there are none — they arrive via events).
   */
  onSessionInit(): void {
    this.client.joinRoom('game');
    this.client.sendGetMapObjectsRequest(0, 0);
    this.buildExistingViews();
  }

  exit(): void {
    // 1. Stop the RAF loop FIRST so no frame renders a half-disposed scene.
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;

    // 2. Detach client subscriptions — a live closure would pin this whole scene.
    for (const off of this.unsubs) off();
    this.unsubs = [];

    // 3. Remove input listeners.
    for (const k of this.keyHandles) Keyboard.removeHandler(k);
    this.keyHandles = [];
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('keydown', this.onKeyDown);

    // 4. Player visuals.
    for (const view of this.views.values()) view.detach();
    this.views.clear();

    // 5. World (ground geometry/material/texture, lights + shadow map, objects).
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
    this.renderer.setPixelRatio(window.devicePixelRatio);
    view.appendChild(this.renderer.domElement);
    view.style.position = 'absolute';
    view.style.top = '0';
    view.style.left = '0';

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
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

  private animate = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.animate);

    this.controls?.update();
    for (const view of this.views.values()) view.update();
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
    document.addEventListener('click', this.onClick);
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

  private onClick = (e: MouseEvent): void => {
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
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyE' && e.code !== 'KeyQ') return;
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
