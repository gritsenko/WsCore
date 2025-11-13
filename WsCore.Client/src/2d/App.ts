import * as Common from '../utils/Common';
import Keyboard from '../utils/Keyboard';
import MapObject from './MapObject';
import WsClient from '../network/WsClient';
import WorldMap from './World';
import Player from './Player';
import Phaser from 'phaser';

export default class MyApp {
  serverUrl = '';
  socket: WebSocket;
  phaserGame: Phaser.Game;
  currentScene: Phaser.Scene;
  playerName: string;

  worldMap = new WorldMap();

  gameClient = new WsClient();

  constructor() {
    console.log('App instance created');
    this.initPhaser();

    this.initKeyHadler(Keyboard.KEY_UP, Keyboard.KEY_UP_MASK_OFFSET);
    this.initKeyHadler(Keyboard.KEY_DOWN, Keyboard.KEY_DOWN_MASK_OFFSET);
    this.initKeyHadler(Keyboard.KEY_LEFT, Keyboard.KEY_LEFT_MASK_OFFSET);
    this.initKeyHadler(Keyboard.KEY_RIGHT, Keyboard.KEY_RIGHT_MASK_OFFSET);
  }

  // Called after Phaser is initialized
  initGameClient() {
    this.gameClient.myPlayerName = this.playerName;
    this.gameClient.onPlayerCreateCallback = p => this.addPlayerCreateCallback(p);
    this.gameClient.onGameInitCallback = () => this.onGameInit();
    this.gameClient.onMapObjectsCallback = data => this.worldMap.updateMapObjects(data);
    this.gameClient.connect('ws://127.0.0.1:5000/ws');
  }

  onGameInit() {
    this.gameClient.sendGetMapObjectsRequest(0, 0);
  }

  initKeyHadler(keyCode, maskBit) {
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
    player.init(this.currentScene, this.gameClient.myPlayer === player);
  }

  initPhaser() {
    const self = this;
    const config = {
      type: Phaser.AUTO,
      parent: 'game',
      scale: {
        mode: Phaser.Scale.RESIZE,
        parent: 'game',
        width: '100%',
        height: '100%',
      },
      backgroundColor: '#fbf0e4',
      physics: {
        default: 'arcade',
      },
      scene: {
        preload: function () {
          self.phaserPreload(this);
        },
        create: function () {
          self.phaserCreate(this);
          self.initGameClient();
        },
        update: function () {
          self.phaserUpdate(this);
        },
      },
    };

    const view = window.document.getElementById('game');

    view.style.position = 'absolute';
    view.style.top = '0';
    view.style.left = '0';

    this.phaserGame = new Phaser.Game(config);
    window.onresize = event => this.fitView(view);
    this.fitView(view);
  }

  phaserPreload(p) {
    WorldMap.preload(p);
    MapObject.preload(p);
    Player.preload(p);
    this.preloadUI(p);
  }

  phaserCreate(p) {
    this.currentScene = p;

    this.worldMap.create(this.currentScene);

    p.cameras.main.setBounds(0, 0, 1920 * 2, 1080 * 2);
    p.physics.world.setBounds(0, 0, 1920 * 2, 1080 * 2);

    p.input.on(
      'pointerdown',
      pointer => {
        this.gameClient.sendUpdatePlayerTargetRequest(
          pointer.x + pointer.camera.scrollX,
          pointer.y + pointer.camera.scrollY
        );
      },
      this
    );

    p.input.keyboard.on('keydown-E', event => {
      console.log('Hello from the E Key!');

      // Get the position where we want to place the tree
      const gridX = Math.floor(this.worldMap.mapCursor.x / WorldMap.cellSize);
      const gridY = Math.floor(this.worldMap.mapCursor.y / WorldMap.cellSize);
      const objectType = Phaser.Math.Between(0, 1);

      // Send request to server to create the object
      this.gameClient.sendSetMapObjectRequest(gridX, gridY, objectType);
    });

    p.input.keyboard.on('keydown-Q', event => {
      console.log('Hello from the Q Key!');
      const x = Math.floor(this.worldMap.mapCursor.x / WorldMap.cellSize);
      const y = Math.floor(this.worldMap.mapCursor.y / WorldMap.cellSize);
      this.gameClient.sendDestroyMapObjectRequest(x, y);
    });
  }

  preloadUI(loader) {
    loader.load.path = '/ui/';
    loader.load.image('logo', 'logo.png');
  }

  createUI(p) {
    const logo = p.add.sprite(140, 50, 'logo');
    logo.scaleX = 0.33;
    logo.scaleY = 0.33;
    logo.alpha = 0.7;
    logo.depth = 100000;
    logo.setScrollFactor(0);
  }

  fitView(view) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    view.style.width = w + 'px';
    view.style.height = h + 'px';

    this.phaserGame.renderer.resize(w, h);
    var config = this.phaserGame.config;

    if (this.currentScene != undefined) this.currentScene.cameras.resize(w, h);
  }

  phaserUpdate(phaser) {
    for (let playerId in this.gameClient.players) {
      const p = this.gameClient.players[playerId];
      p.update();
    }
    this.worldMap.phaserUpdate(phaser);
  }
}
