import * as Common from '../utils/Common';
import Keyboard from '../utils/Keyboard';
import WsClient from '../network/WsClient';
import World3D from './World3D';
import Player3D from './Player3D';
import MapObject3D from './MapObject3D';
import ChatUI from '../utils/ChatUI';
import * as THREE from 'three';
// Import OrbitControls for three.js
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default class MyApp3D {
  serverUrl: string;
  socket: WebSocket;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  playerName: string;

  worldMap = new World3D();

  gameClient: WsClient<Player3D>;
  chatUI: ChatUI;

  constructor(serverUrl: string, existingClient?: WsClient<Player3D>) {
    console.log('App3D instance created');
    this.serverUrl = serverUrl;
    this.gameClient = existingClient || new WsClient<Player3D>();
    this.chatUI = new ChatUI();
    this.initThree();

    this.initKeyHandler(Keyboard.KEY_UP, Keyboard.KEY_UP_MASK_OFFSET);
    this.initKeyHandler(Keyboard.KEY_DOWN, Keyboard.KEY_DOWN_MASK_OFFSET);
    this.initKeyHandler(Keyboard.KEY_LEFT, Keyboard.KEY_LEFT_MASK_OFFSET);
    this.initKeyHandler(Keyboard.KEY_RIGHT, Keyboard.KEY_RIGHT_MASK_OFFSET);
  }

  // Called after Three.js is initialized
  initGameClient() {
    // Set player factory to create Player3D instances (not LobbyPlayer)
    this.gameClient.playerFactory = (id: number) => new Player3D(id);

    // Clear existing players from lobby so they get recreated as Player3D instances
    this.gameClient.players = {};
    this.gameClient.playersCount = 0;
    this.gameClient.myPlayer = null;

    this.gameClient.myPlayerName = this.playerName;
    this.gameClient.onPlayerCreateCallback = p => this.addPlayerCreateCallback(p);
    this.gameClient.onGameInitCallback = () => this.onGameInit();
    this.gameClient.onMapObjectsCallback = data => this.worldMap.updateMapObjects(data);

    // Set up chat message callback
    this.chatUI.setOnMessageCallback(message => {
      this.gameClient.sendChatMessageRequest(message);
    });

    // Override writeToChat to display messages in UI
    this.gameClient.writeToChat = (id: number, message: string) => {
      let playerName = `Player ${id}`;

      // First, check if this is our own message
      if (this.gameClient.myPlayer && id === this.gameClient.myPlayer.id) {
        playerName = this.playerName;
      }
      // Check cached player name
      else if (this.gameClient.playerNames[id]) {
        playerName = this.gameClient.playerNames[id];
      }
      // Check if the player object has a name
      else {
        const player = this.gameClient.players[id];
        if (player?.name && player.name.length > 0) {
          playerName = player.name;
        }
      }

      this.chatUI.addMessage(playerName, message);
    };

    // Only connect if this is a new client (not reusing from lobby)
    if (!this.gameClient.ws) {
      this.gameClient.connect(this.serverUrl);

      // For new connections, wrap the callback to join room on init
      const originalGameInit = this.gameClient.onGameInitCallback;
      this.gameClient.onGameInitCallback = () => {
        // Join 3d-game room after player initialization
        this.gameClient.joinRoom('3d-game', this.playerName);
        originalGameInit?.();
      };
    } else {
      // For existing connections, directly join room and init game
      this.gameClient.joinRoom('3d-game', this.playerName);
      this.onGameInit();
    }
  }

  onGameInit() {
    this.gameClient.sendGetMapObjectsRequest(0, 0);
  }

  initKeyHandler(keyCode, maskBit) {
    const self = this;
    const keyObj = Keyboard.addHnadler(keyCode);
    keyObj.press = () => {
      const p = self.gameClient.myPlayer;
      p.controls = Common.setBit(p.controls, maskBit);
      self.gameClient.sendUpdatePlayerStateRequest(p.ax, p.ay, p.controls);
    };
    keyObj.release = () => {
      const p = self.gameClient.myPlayer;
      p.controls = Common.clearBit(p.controls, maskBit);
      self.gameClient.sendUpdatePlayerStateRequest(p.ax, p.ay, p.controls);
    };
  }

  addPlayerCreateCallback(player) {
    player.init(this.scene, this.gameClient.myPlayer === player);
  }

  initThree() {
    const self = this;

    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfbf0e4);

    // Perspective camera setup
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(
      60, // field of view
      width / height, // aspect ratio
      0.1, // near plane
      10000 // far plane
    );

    // Position camera for 3D view with slight tilt
    this.camera.position.set(0, 800, 800);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup
    const view = window.document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    view.appendChild(this.renderer.domElement);

    // Styling
    view.style.position = 'absolute';
    view.style.top = '0';
    view.style.left = '0';

    // Initialize OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Smooth damping
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 100;
    this.controls.maxDistance = 3000;
    this.controls.maxPolarAngle = Math.PI / 2.1; // Prevent going below ground

    // Load assets and initialize
    this.loadAssets(() => {
      Player3D.preload(new THREE.TextureLoader());
      this.worldMap.create(this.scene);
      this.initGameClient();
      this.animate();
      this.createBackToLobbyButton();
    });

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());

    // Handle mouse click - updated for 3D space
    document.addEventListener('click', e => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const mouse = new THREE.Vector2(x, y);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);

      // Create a ground plane for ray intersection
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const point = new THREE.Vector3();
      raycaster.ray.intersectPlane(groundPlane, point);

      if (point) {
        this.gameClient.sendUpdatePlayerTargetRequest(point.x, point.z);
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.code === 'KeyE') {
        console.log('E key pressed - add map object');
        const cursor = new THREE.Vector3();
        // Get intersection with ground plane
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        if (raycaster.ray.intersectPlane(groundPlane, cursor)) {
          const gridX = Math.floor(cursor.x / World3D.cellSize);
          const gridY = Math.floor(cursor.z / World3D.cellSize);
          const objectType = Math.floor(Math.random() * 2);
          this.gameClient.sendSetMapObjectRequest(gridX, gridY, objectType);
        }
      }
      if (e.code === 'KeyQ') {
        console.log('Q key pressed - destroy map object');
        const cursor = new THREE.Vector3();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        if (raycaster.ray.intersectPlane(groundPlane, cursor)) {
          const gridX = Math.floor(cursor.x / World3D.cellSize);
          const gridY = Math.floor(cursor.z / World3D.cellSize);
          this.gameClient.sendDestroyMapObjectRequest(gridX, gridY);
        }
      }
    });
  }

  loadAssets(callback) {
    const textureLoader = new THREE.TextureLoader();
    let loadedCount = 0;
    const totalToLoad = 4; // ground, trees, knight sprites

    const onLoad = () => {
      loadedCount++;
      if (loadedCount === totalToLoad) {
        callback();
      }
    };

    // Load ground texture
    textureLoader.load('/map/ground/Ground.png', onLoad);

    // Load tree textures
    textureLoader.load('/map/objects/trees/tree_1.png', onLoad);
    textureLoader.load('/map/objects/trees/tree_2.png', onLoad);

    // Load knight sprite sheet
    textureLoader.load('/knight/01_idle_sword.png', onLoad);
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    // Update controls for smooth damping
    if (this.controls) {
      this.controls.update();
    }

    // Update all players
    for (let playerId in this.gameClient.players) {
      const p = this.gameClient.players[playerId];
      p.update();
    }

    this.worldMap.update();

    this.renderer.render(this.scene, this.camera);
  };

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  }
  createBackToLobbyButton() {
    // Create a button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.position = 'fixed';
    buttonContainer.style.top = '20px';
    buttonContainer.style.left = '20px';
    buttonContainer.style.zIndex = '10000';
    buttonContainer.style.pointerEvents = 'auto';

    // Button background
    const buttonBg = document.createElement('div');
    buttonBg.style.background = 'rgba(44, 47, 51, 0.8)';
    buttonBg.style.border = '2px solid #4a9eff';
    buttonBg.style.borderRadius = '4px';
    buttonBg.style.padding = '8px 16px';
    buttonBg.style.cursor = 'pointer';
    buttonBg.style.transition = 'all 0.2s';
    buttonBg.style.fontFamily = 'Arial, sans-serif';
    buttonBg.style.fontSize = '12px';
    buttonBg.style.color = '#4a9eff';
    buttonBg.style.fontWeight = '600';
    buttonBg.textContent = 'Back to Lobby';

    // Add hover effects
    buttonBg.addEventListener('mouseenter', () => {
      buttonBg.style.background = 'rgba(64, 68, 75, 0.9)';
    });

    buttonBg.addEventListener('mouseleave', () => {
      buttonBg.style.background = 'rgba(44, 47, 51, 0.8)';
    });

    buttonBg.addEventListener('click', () => {
      this.backToLobby();
    });

    buttonContainer.appendChild(buttonBg);
    document.body.appendChild(buttonContainer);
  }

  backToLobby() {
    console.log('Returning to lobby');

    // Clean up Three.js renderer
    if (this.renderer) {
      this.renderer.dispose();
    }

    // Clear game container
    const gameContainer = document.getElementById('game');
    if (gameContainer) {
      gameContainer.innerHTML = '';
    }

    // Remove the back to lobby button
    const buttons = document.querySelectorAll('div[style*="Back to Lobby"]');
    buttons.forEach(btn => btn.remove());

    // Dispatch event to return to lobby
    const event = new CustomEvent('gameReturnToLobby');
    document.dispatchEvent(event);
  }
}
