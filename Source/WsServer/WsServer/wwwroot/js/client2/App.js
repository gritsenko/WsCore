import * as Common from './Common.js';
import Keyboard from './Keyboard.js';
import MapObject from './MapObject.js';
import WsClient from "./Ws/WsClient.js";
import WorldMap from "./World.js";
import Player from './Player.js';
import * as WsConnection from "./Ws/WsConnection.js";
var MyApp = /** @class */ (function () {
    function MyApp() {
        this.serverUrl = "";
        this.worldMap = new WorldMap();
        this.gameClient = new WsClient();
        console.log("App instance created");
        this.initPhaser();
        this.initKeyHadler(Keyboard.KEY_UP, Keyboard.KEY_UP_MASK_OFFSET);
        this.initKeyHadler(Keyboard.KEY_DOWN, Keyboard.KEY_DOWN_MASK_OFFSET);
        this.initKeyHadler(Keyboard.KEY_LEFT, Keyboard.KEY_LEFT_MASK_OFFSET);
        this.initKeyHadler(Keyboard.KEY_RIGHT, Keyboard.KEY_RIGHT_MASK_OFFSET);
    }
    /* called after phaser is initalized */
    MyApp.prototype.initGameClient = function () {
        var _this = this;
        //this.gameClient = new WsClient();
        this.gameClient.myPlayerName = this.playerName;
        this.gameClient.onPlayerCreateCallback = function (p) { return _this.addPlayerCreateCallback(p); };
        this.gameClient.onGameInitCallback = function (p) { return _this.onGameInit(); };
        this.gameClient.onMapObjectsCallback = function (data) { return _this.worldMap.updateMapObjects(data); };
        this.gameClient.connect("ws://127.0.0.1:5000/ws");
    };
    MyApp.prototype.onGameInit = function () {
        this.gameClient.sendGetMapObjects(0, 0);
    };
    MyApp.prototype.initKeyHadler = function (keyCode, maskBit) {
        var self = this;
        var keyObj = Keyboard.addHnadler(keyCode);
        keyObj.press = function () {
            var p = self.gameClient.myPlayer;
            p.controls = Common.setBit(p.controls, maskBit);
            self.gameClient.sendUpdatePlayerState(p.ax, p.ay, p.controls);
        };
        keyObj.release = function () {
            var p = self.gameClient.myPlayer;
            p.controls = Common.clearBit(p.controls, maskBit);
            self.gameClient.sendUpdatePlayerState(p.ax, p.ay, p.controls);
        };
    };
    MyApp.prototype.addPlayerCreateCallback = function (player) {
        player.init(this.currentScene, this.gameClient.myPlayer === player);
    };
    MyApp.prototype.initPhaser = function () {
        var _this = this;
        var self = this;
        var config = {
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
                "default": 'arcade'
            },
            scene: {
                preload: function () { self.phaserPreload(this); },
                create: function () {
                    self.phaserCreate(this);
                    self.initGameClient();
                },
                update: function () { self.phaserUpdate(this); }
            }
        };
        var view = window.document.getElementById("game");
        view.style.position = "absolute";
        view.style.top = "0";
        view.style.left = "0";
        this.phaserGame = new Phaser.Game(config);
        window.onresize = function (event) { return _this.fitView(view); };
        this.fitView(view);
    };
    MyApp.prototype.phaserPreload = function (p) {
        WorldMap.preload(p);
        MapObject.preload(p);
        Player.preload(p);
        this.preloadUI(p);
    };
    MyApp.prototype.phaserCreate = function (p) {
        var _this = this;
        this.currentScene = p;
        this.worldMap.create(this.currentScene);
        //  Set the camera and physics bounds to be the size of 4x4 bg images
        p.cameras.main.setBounds(0, 0, 1920 * 2, 1080 * 2);
        p.physics.world.setBounds(0, 0, 1920 * 2, 1080 * 2);
        p.input.on('pointerdown', function (pointer) {
            _this.gameClient.sendUpdatePlayerTarget(pointer.x + pointer.camera.scrollX, pointer.y + pointer.camera.scrollY);
        }, this);
        p.input.keyboard.on('keydown-E', function (event) {
            console.log('Hello from the E Key!');
            var mp = new MapObject();
            var data = new WsConnection.MapObjectData();
            data.X = Math.floor(_this.worldMap.mapCursor.x / WorldMap.cellSize);
            data.Y = Math.floor(_this.worldMap.mapCursor.y / WorldMap.cellSize);
            data.ObjectType = Phaser.Math.Between(0, 1);
            mp.create(p, data);
            _this.gameClient.sendSetMapObject(data.X, data.Y, data.ObjectType);
        });
        p.input.keyboard.on('keydown-Q', function (event) {
            console.log('Hello from the Q Key!');
            var x = Math.floor(_this.worldMap.mapCursor.x / WorldMap.cellSize);
            var y = Math.floor(_this.worldMap.mapCursor.y / WorldMap.cellSize);
            _this.gameClient.sendDestroyMapObject(x, y);
        });
        //this.createUI(p);
    };
    MyApp.prototype.preloadUI = function (loader) {
        loader.load.path = "/assets/ui/";
        loader.load.image("logo", "logo.png");
    };
    MyApp.prototype.createUI = function (p) {
        var logo = p.add.sprite(140, 50, "logo");
        logo.scaleX = 0.33;
        logo.scaleY = 0.33;
        logo.alpha = 0.7;
        logo.depth = 100000;
        logo.setScrollFactor(0);
        //p.cameras.main.ignore([logo]);
        //Phaser.Display.Align.In.TopLeft(logo, p);
    };
    MyApp.prototype.fitView = function (view) {
        var w = window.innerWidth;
        var h = window.innerHeight;
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
    };
    MyApp.prototype.phaserUpdate = function (phaser) {
        for (var playerId in this.gameClient.players) {
            var p = this.gameClient.players[playerId];
            p.update();
        }
        this.worldMap.phaserUpdate(phaser);
    };
    return MyApp;
}());
export default MyApp;
var app;
function runGame() {
    var form = document.getElementById("name-form");
    var textbox = document.getElementById("name-text-input");
    form.style.display = "none";
    app = new MyApp();
    var userName = textbox.value;
    app.playerName = userName;
}
document.addEventListener("DOMContentLoaded", function () { return runGame(); });
function onStartGameClicked() {
    runGame();
}
//# sourceMappingURL=App.js.map