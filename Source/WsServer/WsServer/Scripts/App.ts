import * as Common from './Common.js';
import Keyboard from './Keyboard.js';
import MapObject from './MapObject.js';
import WsClient from "./Ws/WsClient.js";
import WorldMap from "./World.js";
import Player from './Player.js';
import * as WsConnection from "./Ws/WsConnection.js";

export default class MyApp {

    serverUrl = "";
    socket: WebSocket;
    phaserGame: Phaser.Game;
    currentScene: Phaser.Scene;
    playerName: string;

    worldMap = new WorldMap();

    gameClient = new WsClient();

    constructor() {
        console.log("App instance created");
        this.initPhaser();

        this.initKeyHadler(Keyboard.KEY_UP, Keyboard.KEY_UP_MASK_OFFSET);
        this.initKeyHadler(Keyboard.KEY_DOWN, Keyboard.KEY_DOWN_MASK_OFFSET);
        this.initKeyHadler(Keyboard.KEY_LEFT, Keyboard.KEY_LEFT_MASK_OFFSET);
        this.initKeyHadler(Keyboard.KEY_RIGHT, Keyboard.KEY_RIGHT_MASK_OFFSET);
    }

    /* called after phaser is initalized */
    initGameClient() {
        //this.gameClient = new WsClient();
        this.gameClient.myPlayerName = this.playerName;
        this.gameClient.onPlayerCreateCallback = p => this.addPlayerCreateCallback(p);
        this.gameClient.onGameInitCallback = p => this.onGameInit();
        this.gameClient.onMapObjectsCallback = data => this.worldMap.updateMapObjects(data);
        this.gameClient.connect("ws://127.0.0.1:5000/ws");
    }

    onGameInit() {
        this.gameClient.sendGetMapObjects(0, 0);
    }

    initKeyHadler(keyCode, maskBit) {
        const self = this;
        const keyObj = Keyboard.addHnadler(keyCode);
        keyObj.press = () => {
            const p = self.gameClient.myPlayer;
            p.controls = Common.setBit(p.controls, maskBit);
            self.gameClient.sendUpdatePlayerState(p.ax, p.ay, p.controls);
        };
        keyObj.release = () => {
            const p = self.gameClient.myPlayer;
            p.controls = Common.clearBit(p.controls, maskBit);
            self.gameClient.sendUpdatePlayerState(p.ax, p.ay, p.controls);
        };
    }

    addPlayerCreateCallback(player) {
        player.init(this.currentScene, this.gameClient.myPlayer === player);
    }

    initPhaser() {

        const self = this;
        const config = {
            type: Phaser.AUTO,
            parent: "game",
            scale: {
                mode: Phaser.Scale.RESIZE,
                parent: 'game',
                width: '100%',
                height: '100%'
            },
            //width: 200,
            //height: 200,
            backgroundColor: "#fbf0e4",
            physics: {
                default: 'arcade',
            },
            scene: {
                preload: function () { self.phaserPreload(this); },
                create: function () {
                    self.phaserCreate(this);
                    self.initGameClient();
                },
                update: function () { self.phaserUpdate(this); },
            }
        };

        const view = window.document.getElementById("game");

        view.style.position = "absolute";
        view.style.top = "0";
        view.style.left = "0";

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

        //  Set the camera and physics bounds to be the size of 4x4 bg images
        p.cameras.main.setBounds(0, 0, 1920 * 2, 1080 * 2);
        p.physics.world.setBounds(0, 0, 1920 * 2, 1080 * 2);

        p.input.on('pointerdown', (pointer) => {
            this.gameClient.sendUpdatePlayerTarget(pointer.x + pointer.camera.scrollX, pointer.y + pointer.camera.scrollY);

        }, this);


        p.input.keyboard.on('keydown-E', event => {

            console.log('Hello from the E Key!');
            var mp = new MapObject();
            var data = new WsConnection.MapObjectData();
            data.X = Math.floor(this.worldMap.mapCursor.x / WorldMap.cellSize);
            data.Y = Math.floor(this.worldMap.mapCursor.y / WorldMap.cellSize);
            data.ObjectType = Phaser.Math.Between(0, 1);
            mp.create(p, data);

            this.gameClient.sendSetMapObject(data.X, data.Y, data.ObjectType);
        });

        p.input.keyboard.on('keydown-Q', event => {

            console.log('Hello from the Q Key!');
            const x = Math.floor(this.worldMap.mapCursor.x / WorldMap.cellSize);
            const y = Math.floor(this.worldMap.mapCursor.y / WorldMap.cellSize);
            this.gameClient.sendDestroyMapObject(x, y);
        });

        //this.createUI(p);
    }

    preloadUI(loader) {
        loader.load.path = "/assets/ui/";
        loader.load.image("logo", "logo.png");
    }

    createUI(p) {
        const logo = p.add.sprite(140, 50, "logo");
        logo.scaleX = 0.33;
        logo.scaleY = 0.33;
        logo.alpha = 0.7;
        logo.depth = 100000;
        logo.setScrollFactor(0);
        //p.cameras.main.ignore([logo]);
        //Phaser.Display.Align.In.TopLeft(logo, p);
    }

    fitView(view) {
        const w = window.innerWidth;
        const h = window.innerHeight;

        //this part resizes the canvas but keeps ratio the same
        view.style.width = w + "px";
        view.style.height = h + "px";
        //this part adjusts the ratio:    

        this.phaserGame.renderer.resize(w, h);
        //hack
        var config = this.phaserGame.config;
        //config.width = w;
        //config.height = h;

        if (this.currentScene != undefined)
            this.currentScene.cameras.resize(w, h);
    }

    phaserUpdate(phaser) {
        for (let playerId in this.gameClient.players) {
            const p = this.gameClient.players[playerId];
            p.update();
        }
        this.worldMap.phaserUpdate(phaser);
    }
}


let app : MyApp;

function runGame() {
    var form = document.getElementById("name-form");
    var textbox = document.getElementById("name-text-input") as HTMLInputElement;
    form.style.display = "none";
    app = new MyApp();
    var userName = textbox.value;
    app.playerName = userName;
}

document.addEventListener("DOMContentLoaded", () => runGame());

function onStartGameClicked() {
    runGame();
}

