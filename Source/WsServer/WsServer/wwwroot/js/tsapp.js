class AnimationDef {
    constructor(key, count) {
        this.key = key;
        this.framesCount = count;
    }
}
/// <reference path="../js/typings/phaser.d.ts" />
class App {
    constructor() {
        this.worldMap = new WorldMap();
        console.log("App instance created");
        this.initPhaser();
        this.initKeyHadler(KEY_UP, KEY_UP_MASK_OFFSET);
        this.initKeyHadler(KEY_DOWN, KEY_DOWN_MASK_OFFSET);
        this.initKeyHadler(KEY_LEFT, KEY_LEFT_MASK_OFFSET);
        this.initKeyHadler(KEY_RIGHT, KEY_RIGHT_MASK_OFFSET);
    }
    /* called after phaser is initalized */
    initGameClient() {
        this.gameClient = new WsClient();
        this.gameClient.myPlayerName = this.playerName;
        this.gameClient.onPlayerCreateCallback = p => this.addPlayerCreateCallback(p);
        this.gameClient.onGameInitCallback = p => this.onGameInit();
        this.gameClient.onMapObjectsCallback = data => this.worldMap.updateMapObjects(data);
        this.gameClient.connect();
    }
    onGameInit() {
        this.gameClient.sendGetMapObjects(0, 0);
    }
    initKeyHadler(keyCode, maskBit) {
        const self = this;
        const keyObj = keyboard(keyCode);
        keyObj.press = () => {
            const p = self.gameClient.myPlayer;
            p.controls = setBit(p.controls, maskBit);
            self.gameClient.sendUpdatePlayerState(p.ax, p.ay, p.controls);
        };
        keyObj.release = () => {
            const p = self.gameClient.myPlayer;
            p.controls = clearBit(p.controls, maskBit);
            self.gameClient.sendUpdatePlayerState(p.ax, p.ay, p.controls);
        };
    }
    addPlayerCreateCallback(p) {
        p.init(this.currentScene, this.gameClient.myPlayer == p);
    }
    initPhaser() {
        const self = this;
        const config = {
            type: Phaser.AUTO,
            parent: "game",
            width: 200,
            height: 200,
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
        this.worldMap.create(p);
        //  Set the camera and physics bounds to be the size of 4x4 bg images
        p.cameras.main.setBounds(0, 0, 1920 * 2, 1080 * 2);
        p.physics.world.setBounds(0, 0, 1920 * 2, 1080 * 2);
        p.input.on('pointerdown', (pointer) => {
            this.gameClient.sendUpdatePlayerTarget(pointer.x + pointer.camera.scrollX, pointer.y + pointer.camera.scrollY);
        }, this);
        this.createUI(p);
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
        config.width = w;
        config.height = h;
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
const KEY_LEFT = 65; //A
const KEY_UP = 87; //W
const KEY_RIGHT = 68; //D
const KEY_DOWN = 83; //S
const KEY_LEFT_MASK_OFFSET = 2;
const KEY_UP_MASK_OFFSET = 0;
const KEY_RIGHT_MASK_OFFSET = 3;
const KEY_DOWN_MASK_OFFSET = 1;
//const KEY_LEFT = 37;
//const KEY_UP = 38;
//const KEY_RIGHT = 39;
//const KEY_DOWN = 40;
function lerp(v0, v1, t) {
    return v0 * (1 - t) + v1 * t;
}
function isBitSet(target, i) {
    return target & (1 << i);
}
function setBit(target, i) {
    const mask = 1 << i;
    target |= mask;
    return target;
}
function clearBit(target, i) {
    const mask = 1 << i;
    target &= ~mask;
    return target;
}
class KeyDef {
}
function keyboard(keyCode) {
    var key = new KeyDef();
    key.code = keyCode;
    key.isDown = false;
    key.isUp = true;
    key.press = undefined;
    key.release = undefined;
    //The `downHandler`
    key.downHandler = event => {
        if (event.keyCode === key.code) {
            if (key.isUp && key.press)
                key.press();
            key.isDown = true;
            key.isUp = false;
            event.preventDefault();
        }
    };
    //The `upHandler`
    key.upHandler = event => {
        if (event.keyCode === key.code) {
            if (key.isDown && key.release)
                key.release();
            key.isDown = false;
            key.isUp = true;
            event.preventDefault();
        }
    };
    //Attach event listeners
    window.addEventListener("keydown", key.downHandler.bind(key), false);
    window.addEventListener("keyup", key.upHandler.bind(key), false);
    return key;
}
var delay = (() => {
    var timer = 0;
    return (callback, ms) => {
        clearTimeout(timer);
        timer = setTimeout(callback, ms);
    };
})();
function debounce(func, wait, immediate) {
    var timeout;
    return function () {
        var context = this, args = arguments;
        var later = function () {
            timeout = null;
            if (!immediate)
                func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow)
            func.apply(context, args);
    };
}
;
var app;
function runGame() {
    var form = document.getElementById("name-form");
    var textbox = document.getElementById("name-text-input");
    form.style.display = "none";
    app = new App();
    var userName = textbox.value;
    app.playerName = userName;
}
document.addEventListener("DOMContentLoaded", () => runGame());
function onStartGameClicked() {
    runGame();
}
class MapObject {
    constructor() {
        this.type = 0;
        this.x = 0;
        this.y = 0;
    }
    static preload(loader) {
        loader.load.path = "/assets/map/objects/trees/";
        loader.load.image("tree1", "tree_1.png");
        loader.load.image("tree2", "tree_2.png");
        loader.load.image("tree3", "tree_3.png");
        loader.load.image("tree4", "tree_4.png");
    }
    create(currentScene, objData) {
        this.x = objData.x;
        this.y = objData.y;
        this.type = objData.objecttype;
        var x = this.x * WorldMap.cellSize + WorldMap.cellSize / 2;
        var y = this.y * WorldMap.cellSize;
        const sprite = currentScene.add.sprite(x, y, "tree" + Math.min(this.type + 1, 4));
        sprite.depth = y + sprite.height / 2;
        this.sprite = sprite;
    }
}
/// <reference path="../js/typings/phaser.d.ts" />
/// <reference path="../js/typings/typestate.d.ts" />
var PlayerState;
(function (PlayerState) {
    PlayerState[PlayerState["Idle"] = 0] = "Idle";
    PlayerState[PlayerState["Run"] = 1] = "Run";
    PlayerState[PlayerState["Attack"] = 2] = "Attack";
    PlayerState[PlayerState["Die"] = 3] = "Die";
})(PlayerState || (PlayerState = {}));
function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length - size);
}
class Player {
    constructor(id) {
        this.x = 0;
        this.y = 0;
        this.ax = 0;
        this.ay = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.angle = 0;
        this.controls = 0;
        this.runPressed = false;
        this.xDir = 0;
        this.hp = 0;
        this.maxHp = 100;
        this.body = 0;
        this.weapon = 0;
        this.armor = 0;
        this.scaleFactor = 1;
        this.fsm = new TypeState.FiniteStateMachine(PlayerState.Run);
        this.id = id;
        this.name = "bot";
        this.speed = { x: 0, y: 0 };
        var fsm = this.fsm;
        //fsm.from(PlayerState.Idle).toAny(PlayerState);
        fsm.fromAny(PlayerState).toAny(PlayerState);
        this.fsm = fsm;
        fsm.on(PlayerState.Idle, (from) => {
            this.setAnimation("knight_idle");
        });
        fsm.on(PlayerState.Run, (from) => {
            this.setAnimation("knight_run");
        });
    }
    setAnimation(name) {
        this.sprite.play(name);
    }
    static preload(loader) {
        loader.load.path = "/assets/knight/";
        this.loadFrames(loader, "knight_idle", "01_idle_sword_", 12);
        this.loadFrames(loader, "knight_run", "01_run_sword_", 8);
        loader.load.path = "/assets/characters/master/";
        this.loadFrames(loader, "master_idle", "01_char_idle_", 11);
        this.loadFrames(loader, "master_run", "02_char_run_", 8);
    }
    static loadFrames(loader, key, filePrefix, count) {
        Player.animationKeys.push(new AnimationDef(key, count));
        for (let i = 1; i <= count; i++) {
            loader.load.image(key + i, filePrefix + pad(i, 4) + ".png");
        }
    }
    static initAnimations(currentScene) {
        if (Player.animationsReady)
            return;
        Player.animationsReady = true;
        for (let i = 0; i < Player.animationKeys.length; i++) {
            const animDef = Player.animationKeys[i];
            const frames = [];
            for (var f = 1; f <= animDef.framesCount; f++)
                frames.push({ key: animDef.key + f });
            currentScene.anims.create({
                key: animDef.key,
                frames: frames,
                frameRate: 12,
                repeat: -1
            });
        }
    }
    updateName(name) {
        if (this.nickText != undefined)
            this.nickText.setText(name);
    }
    init(currentScene, isMyPlayer) {
        this.isMyPlayer = isMyPlayer;
        Player.initAnimations(currentScene);
        const sprite = currentScene.add.sprite(this.x, this.y, "knight_idle1");
        const nickText = currentScene.add.text(this.x, this.y - Player.nickOffset, this.name);
        if (isMyPlayer)
            currentScene.cameras.main.startFollow(sprite);
        this.nickText = nickText;
        if (this.name.substr(0, 1) === "@") {
            sprite.alpha = 0.2;
        }
        this.sprite = sprite;
        sprite.setScale(this.scaleFactor);
        this.fsm.go(PlayerState.Idle);
    }
    dist(v1, v2) {
        const vv = { x: v2.x - v1.x, y: v2.y - v1.y };
        return Math.sqrt(vv.x * vv.x + vv.y * vv.y);
    }
    getVelocity() { return Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y); }
    update() {
        const sprite = this.sprite;
        if (sprite == undefined)
            return;
        sprite.x = lerp(sprite.x, this.x, 0.09);
        sprite.y = lerp(sprite.y, this.y, 0.09);
        sprite.depth = sprite.y + sprite.height;
        this.nickText.depth = sprite.depth;
        this.nickText.x = sprite.x - this.nickText.width / 2;
        this.nickText.y = sprite.y + Player.nickOffset;
    }
    onStateUpdatedFromServer() {
        if (this.getVelocity() > 10)
            this.setState(PlayerState.Run);
        if (this.getVelocity() < 10)
            this.setState(PlayerState.Idle);
        //if (this.getVelocity() > 0.1 || this.runPressed) {
        //    if (this.fsm.currentState !== PlayerState.Run)
        //        this.fsm.go(PlayerState.Run);
        //} else {
        //    if (this.fsm.currentState !== PlayerState.Idle)
        //        this.fsm.go(PlayerState.Idle);
        //}
        this.updateDirection();
    }
    updateDirection() {
        if (this.targetX > this.sprite.x && this.sprite.scaleX < this.scaleFactor) {
            this.sprite.scaleX = this.scaleFactor;
        }
        if (this.targetX < this.sprite.x && this.sprite.scaleX > -this.scaleFactor) {
            this.sprite.scaleX = -this.scaleFactor;
        }
    }
    setState(playerState) {
        var self = this;
        if (self.fsm.currentState !== playerState)
            self.fsm.go(playerState);
        //delay(() => {
        //    },
        //    100);
    }
}
Player.nickOffset = -60;
Player.animationKeys = [];
Player.animationsReady = false;
class ReadBuffer {
    setInput(data) {
        this.inputBufferView = new DataView(data);
        this.inputBufferOffset = 0;
        return this;
    }
    popString() {
        var size = this.inputBufferView.getInt32(this.inputBufferOffset, ReadBuffer.LittleEndian);
        this.inputBufferOffset += 4;
        var arr = new Uint8Array(size);
        for (var i = 0; i < size; i++) {
            arr[i] = this.inputBufferView.getUint8(this.inputBufferOffset + i);
        }
        var str = this.utf8ArrayToStr(arr);
        this.inputBufferOffset += size;
        return str;
    }
    popStringFixedLength(length) {
        const arr = new Uint8Array(length);
        for (let i = 0; i < length; i++) {
            arr[i] = this.inputBufferView.getUint8(this.inputBufferOffset + i);
        }
        const str = this.utf8ArrayToStr(arr);
        this.inputBufferOffset += length;
        return str;
    }
    utf8ArrayToStr(array) {
        var out, i, len, c;
        var char2, char3;
        out = "";
        len = array.length;
        i = 0;
        while (i < len) {
            c = array[i++];
            switch (c >> 4) {
                case 0:
                    break;
                case 1:
                case 2:
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                    // 0xxxxxxx
                    out += String.fromCharCode(c);
                    break;
                case 12:
                case 13:
                    // 110x xxxx   10xx xxxx
                    char2 = array[i++];
                    out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
                    break;
                case 14:
                    // 1110 xxxx  10xx xxxx  10xx xxxx
                    char2 = array[i++];
                    char3 = array[i++];
                    out += String.fromCharCode(((c & 0x0F) << 12) |
                        ((char2 & 0x3F) << 6) |
                        ((char3 & 0x3F) << 0));
                    break;
            }
        }
        return out;
    }
    popInt8() {
        var result = this.inputBufferView.getInt8(this.inputBufferOffset);
        this.inputBufferOffset += 1;
        return result;
    }
    popInt16() {
        const result = (this.inputBufferView.getInt16(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 2;
        return result;
    }
    popInt32() {
        const result = (this.inputBufferView.getInt32(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 4;
        return result;
    }
    popUInt8() {
        const result = (this.inputBufferView.getUint8(this.inputBufferOffset));
        this.inputBufferOffset += 1;
        return result;
    }
    popUInt16() {
        const result = (this.inputBufferView.getUint16(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 2;
        return result;
    }
    popUInt32() {
        const result = (this.inputBufferView.getUint32(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 4;
        return result;
    }
    popFloat() {
        const result = (this.inputBufferView.getFloat32(this.inputBufferOffset, ReadBuffer.LittleEndian));
        this.inputBufferOffset += 4;
        return result;
    }
}
ReadBuffer.LittleEndian = true;
class WorldMap {
    constructor() {
        this.objects = [];
    }
    static preload(loader) {
        loader.load.image("ground", "/assets/map/ground/Ground.png");
    }
    create(p) {
        this.currentScene = p;
        this.map = p.make.tilemap({ width: 200, height: 200, tileWidth: WorldMap.cellSize, tileHeight: WorldMap.cellSize });
        var tiles = this.map.addTilesetImage("ground", null, WorldMap.cellSize, WorldMap.cellSize);
        // Create a layer filled with random tiles
        var layer = this.map.createBlankDynamicLayer("layer1", tiles);
        layer.randomize(0, 0, this.map.width, this.map.height, [0, 1, 2, 3]);
        var mapCursor = p.add.graphics();
        this.mapCursor = mapCursor;
        var color = 0xffff00;
        var alpha = 1;
        this.mapCursor.fillStyle(color, alpha);
        this.mapCursor.fillRect(0, 0, WorldMap.cellSize, WorldMap.cellSize);
        p.input.keyboard.on('keydown_E', function (event) {
            console.log('Hello from the E Key!');
            var mp = new MapObject();
            var data = new MapObjectData();
            data.x = Math.floor(mapCursor.x / WorldMap.cellSize);
            data.y = Math.floor(mapCursor.y / WorldMap.cellSize);
            data.objecttype = 0;
            mp.create(p, data);
        });
    }
    updateMapObjects(objs) {
        var o = objs;
        for (var i = 0; i < o.length; i++) {
            var mp = new MapObject();
            mp.create(this.currentScene, o[i]);
        }
    }
    posToCell(x) {
        return Math.floor(x / WorldMap.cellSize) * WorldMap.cellSize;
    }
    phaserUpdate(phaser) {
        var camX = 0;
        var camY = 0;
        if (phaser.input.activePointer.camera != null) {
            camX = phaser.input.activePointer.camera.scrollX;
            camY = phaser.input.activePointer.camera.scrollY;
        }
        this.mapCursor.x = this.posToCell(phaser.input.activePointer.x + camX);
        this.mapCursor.y = this.posToCell(phaser.input.activePointer.y + camY);
    }
}
WorldMap.cellSize = 50;
class WriteBuffer {
    constructor() {
        this.outputBufferLen = 0;
        this.newMessage();
    }
    newMessage() {
        this.outputBuffer = [];
        this.outputBufferLen = 0;
        return this;
    }
    pushToBuffer(value, size, callback) {
        this.outputBuffer.push({
            "size": size,
            "value": value,
            "callback": callback
        });
        this.outputBufferLen += size;
    }
    pushString(value, length) {
        var utf8 = this.toUtf8Array(value);
        console.log("setting buffer string: " + value);
        this.pushToBuffer(utf8, length, this.setFixedByteArray);
        return this;
    }
    pushInt8(value) {
        this.pushToBuffer(value, 1, this.setInt);
        return this;
    }
    pushInt16(value) {
        this.pushToBuffer(value, 2, this.setInt);
        return this;
    }
    pushInt32(value) {
        this.pushToBuffer(value, 4, this.setInt);
        return this;
    }
    pushUInt8(value) {
        this.pushToBuffer(value, 1, this.setUint);
        return this;
    }
    pushUInt16(value) {
        this.pushToBuffer(value, 2, this.setUint);
        return this;
    }
    pushUInt32(value) {
        this.pushToBuffer(value, 4, this.setUint);
        return this;
    }
    pushFloat(value) {
        this.pushToBuffer(value, 4, this.setFloat);
        return this;
    }
    setInt(buffView, value, size, offset) {
        if (size === 1) {
            buffView.setInt8(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 2) {
            buffView.setInt16(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 4) {
            buffView.setInt32(offset, value, WriteBuffer.littleEndian);
        }
    }
    setFloat(buffView, value, size, offset) {
        if (size === 4) {
            buffView.setFloat32(offset, value, WriteBuffer.littleEndian);
        }
    }
    setUint(buffView, value, size, offset) {
        if (size === 1) {
            buffView.setUint8(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 2) {
            buffView.setUint16(offset, value, WriteBuffer.littleEndian);
        }
        if (size === 4) {
            buffView.setUint32(offset, value, WriteBuffer.littleEndian);
        }
    }
    toHexString(byteArray) {
        return byteArray.map((byte) => { return (`0${(byte & 0xFF).toString(16)}`).slice(-2); }).join("-");
    }
    toUtf8Array(str) {
        var utf8 = [];
        for (var i = 0; i < str.length; i++) {
            var charcode = str.charCodeAt(i);
            if (charcode < 0x80)
                utf8.push(charcode);
            else if (charcode < 0x800) {
                utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
            }
            else if (charcode < 0xd800 || charcode >= 0xe000) {
                utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            }
            // surrogate pair
            else {
                i++;
                // UTF-16 encodes 0x10000-0x10FFFF by
                // subtracting 0x10000 and splitting the
                // 20 bits of 0x0-0xFFFFF into two halves
                charcode = 0x10000 + (((charcode & 0x3ff) << 10)
                    | (str.charCodeAt(i) & 0x3ff));
                utf8.push(0xf0 | (charcode >> 18), 0x80 | ((charcode >> 12) & 0x3f), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
            }
        }
        return utf8;
    }
    setByteArray(buffView, value, size, offset) {
        //set length of following array
        buffView.setInt16(offset, value.length);
        for (var i = 0; i < value.length; i++) {
            buffView.setUint8(offset + i, value[i]);
        }
    }
    setFixedByteArray(buffView, value, size, offset) {
        var len = value.length;
        for (var i = 0; i < size; i++) {
            if (i < len)
                buffView.setUint8(offset + i, value[i]);
            else
                buffView.setUint8(offset + i, 0);
        }
    }
    send(ws) {
        if (!ws || ws.readyState !== 1 /* OPEN */)
            return;
        const outputBufferArray = new ArrayBuffer(this.outputBufferLen);
        const dataView = new DataView(outputBufferArray);
        var curOffset = 0;
        for (var i = 0, maxIndex = this.outputBuffer.length; i < maxIndex; i++) {
            var item = this.outputBuffer[i];
            item.callback(dataView, item.value, item.size, curOffset);
            curOffset += item.size;
        }
        ws.send(outputBufferArray);
        this.outputBuffer = [];
        this.outputBufferLen = 0;
    }
}
WriteBuffer.littleEndian = true;
/// <reference path="ReadBuffer.ts" />
/// <reference path="WriteBuffer.ts" />
//MessageType enum builder
var ServerMessageType;
(function (ServerMessageType) {
    ServerMessageType[ServerMessageType["GameState"] = 0] = "GameState";
    ServerMessageType[ServerMessageType["PlayersMovment"] = 1] = "PlayersMovment";
    ServerMessageType[ServerMessageType["PlayerJoined"] = 2] = "PlayerJoined";
    ServerMessageType[ServerMessageType["PlayerLeft"] = 3] = "PlayerLeft";
    ServerMessageType[ServerMessageType["RespawnPlayer"] = 4] = "RespawnPlayer";
    ServerMessageType[ServerMessageType["PlayerSetHp"] = 5] = "PlayerSetHp";
    ServerMessageType[ServerMessageType["PlayersTop"] = 6] = "PlayersTop";
    ServerMessageType[ServerMessageType["MapTiles"] = 51] = "MapTiles";
    ServerMessageType[ServerMessageType["MapObjects"] = 52] = "MapObjects";
    ServerMessageType[ServerMessageType["SetPlayerName"] = 100] = "SetPlayerName";
    ServerMessageType[ServerMessageType["UpdatePlayerSlots"] = 102] = "UpdatePlayerSlots";
    ServerMessageType[ServerMessageType["PlayerShooting"] = 103] = "PlayerShooting";
    ServerMessageType[ServerMessageType["ChatMessage"] = 200] = "ChatMessage";
    ServerMessageType[ServerMessageType["InitPlayer"] = 255] = "InitPlayer";
})(ServerMessageType || (ServerMessageType = {}));
;
var ClientMessageType;
(function (ClientMessageType) {
    ClientMessageType[ClientMessageType["GetTiles"] = 50] = "GetTiles";
    ClientMessageType[ClientMessageType["GetMapObjects"] = 51] = "GetMapObjects";
    ClientMessageType[ClientMessageType["SetPlayerName"] = 100] = "SetPlayerName";
    ClientMessageType[ClientMessageType["UpdatePlayerState"] = 101] = "UpdatePlayerState";
    ClientMessageType[ClientMessageType["UpdatePlayerSlots"] = 102] = "UpdatePlayerSlots";
    ClientMessageType[ClientMessageType["PlayerShooting"] = 103] = "PlayerShooting";
    ClientMessageType[ClientMessageType["HitPlayer"] = 104] = "HitPlayer";
    ClientMessageType[ClientMessageType["RespawnPlayer"] = 105] = "RespawnPlayer";
    ClientMessageType[ClientMessageType["UpdatePlayerTarget"] = 106] = "UpdatePlayerTarget";
    ClientMessageType[ClientMessageType["ChatMessage"] = 200] = "ChatMessage";
})(ClientMessageType || (ClientMessageType = {}));
;
//Data definitions
class MapObjectData {
}
class MovmentStateData {
}
class PlayerStateData {
}
class ChatServerMessage {
}
class GameStateServerMessage {
}
class InitPlayerServerMessage {
}
class MapObjectsServerMessage {
}
class PlayerJoinedServerMessage {
}
class PlayerLeftServerMessage {
}
class PlayerRespawnServerMessage {
}
class PlayerShootingServerMessage {
}
class PlayersMovementServerMessage {
}
class PlayersTopServerMessage {
}
class SetPlayerHpServerMessage {
}
class SetPlayerNameServerMessage {
}
class UpdatePlayerSlotsServerMessage {
}
class ChatClientMessage {
}
class GetMapObjectsClientMessage {
}
class GetTilesClientMessage {
}
class PlayerHitClientMessage {
}
class PlayerRespawnClientMessage {
}
class PlayerShootingClientMessage {
}
class SetPlayerNameClientMessage {
}
class UpdatePlayerSlotsClientMessage {
}
class UpdatePlayerStateClientMessage {
}
class UpdatePlayerTargetClientMessage {
}
class Wsc {
    constructor() {
        this.clientId = -1;
        this.writeBuff = new WriteBuffer();
        this.readBuff = new ReadBuffer();
    }
    connect(overrideUrl = null) {
        this.ws = this.createSocket();
        this.overrideUrl = overrideUrl;
    }
    createSocket() {
        const scheme = document.location.protocol == "https:" ? "wss" : "ws";
        const port = document.location.port ? (":" + document.location.port) : "";
        const serverUrl = scheme + "://" + document.location.hostname + port + "/ws";
        this.ws = new WebSocket(this.overrideUrl == undefined ? serverUrl : this.overrideUrl);
        this.ws.binaryType = "arraybuffer";
        this.ws.onmessage = e => this.processServerMessage(new ReadBuffer().setInput(e.data));
        return this.ws;
    }
    //Array reader
    readArray(buff, itemReader) {
        var itemsCount = buff.popUInt32();
        var items = [];
        for (let i = 0; i < itemsCount; i++) {
            items.push(itemReader(buff));
        }
        return items;
    }
    //Data readers
    readMapObjectData(buff) {
        const obj = new MapObjectData();
        obj.objectid = buff.popUInt32();
        obj.x = buff.popFloat();
        obj.y = buff.popFloat();
        obj.objecttype = buff.popUInt32();
        return obj;
    }
    readMovmentStateData(buff) {
        const obj = new MovmentStateData();
        obj.playerid = buff.popUInt32();
        obj.x = buff.popFloat();
        obj.y = buff.popFloat();
        obj.aimx = buff.popFloat();
        obj.aimy = buff.popFloat();
        obj.targetx = buff.popFloat();
        obj.targety = buff.popFloat();
        obj.bodyangle = buff.popInt32();
        obj.controlsstate = buff.popInt32();
        obj.velocityx = buff.popFloat();
        obj.velocityy = buff.popFloat();
        obj.animationstate = buff.popInt32();
        return obj;
    }
    readPlayerStateData(buff) {
        const obj = new PlayerStateData();
        obj.id = buff.popUInt32();
        obj.name = buff.popStringFixedLength(32);
        obj.hp = buff.popUInt8();
        obj.maxhp = buff.popUInt8();
        obj.bodyindex = buff.popInt32();
        obj.weaponindex = buff.popInt32();
        obj.armorindex = buff.popInt32();
        obj.movmentstate = this.readMovmentStateData(buff);
        return obj;
    }
    //Message readers
    onChatMessage(msg) {
    }
    onGameState(msg) {
    }
    onInitPlayer(msg) {
    }
    onMapObjects(msg) {
    }
    onPlayerJoined(msg) {
    }
    onPlayerLeft(msg) {
    }
    onRespawnPlayer(msg) {
    }
    onPlayerShooting(msg) {
    }
    onPlayersMovment(msg) {
    }
    onPlayersTop(msg) {
    }
    onPlayerSetHp(msg) {
    }
    onSetPlayerName(msg) {
    }
    onUpdatePlayerSlots(msg) {
    }
    processServerMessage(buff) {
        //getting server message type
        const serverMessageType = buff.popUInt8();
        switch (serverMessageType) {
            case ServerMessageType.ChatMessage:
                var chatmessageMessage = new ChatServerMessage();
                chatmessageMessage.clientid = buff.popUInt32();
                chatmessageMessage.message = buff.popStringFixedLength(256);
                this.onChatMessage(chatmessageMessage);
                break;
            case ServerMessageType.GameState:
                var gamestateMessage = new GameStateServerMessage();
                gamestateMessage.playerstatedata = this.readArray(buff, b => { return this.readPlayerStateData(b); });
                this.onGameState(gamestateMessage);
                break;
            case ServerMessageType.InitPlayer:
                var initplayerMessage = new InitPlayerServerMessage();
                initplayerMessage.clientid = buff.popUInt32();
                this.onInitPlayer(initplayerMessage);
                break;
            case ServerMessageType.MapObjects:
                var mapobjectsMessage = new MapObjectsServerMessage();
                mapobjectsMessage.mapobjects = this.readArray(buff, b => { return this.readMapObjectData(b); });
                this.onMapObjects(mapobjectsMessage);
                break;
            case ServerMessageType.PlayerJoined:
                var playerjoinedMessage = new PlayerJoinedServerMessage();
                playerjoinedMessage.playerstatedata = this.readPlayerStateData(buff);
                this.onPlayerJoined(playerjoinedMessage);
                break;
            case ServerMessageType.PlayerLeft:
                var playerleftMessage = new PlayerLeftServerMessage();
                playerleftMessage.clientid = buff.popUInt32();
                this.onPlayerLeft(playerleftMessage);
                break;
            case ServerMessageType.RespawnPlayer:
                var respawnplayerMessage = new PlayerRespawnServerMessage();
                respawnplayerMessage.playerstatedata = this.readPlayerStateData(buff);
                this.onRespawnPlayer(respawnplayerMessage);
                break;
            case ServerMessageType.PlayerShooting:
                var playershootingMessage = new PlayerShootingServerMessage();
                playershootingMessage.clientid = buff.popUInt32();
                playershootingMessage.weapon = buff.popInt32();
                this.onPlayerShooting(playershootingMessage);
                break;
            case ServerMessageType.PlayersMovment:
                var playersmovmentMessage = new PlayersMovementServerMessage();
                playersmovmentMessage.movmentstates = this.readArray(buff, b => { return this.readMovmentStateData(b); });
                this.onPlayersMovment(playersmovmentMessage);
                break;
            case ServerMessageType.PlayersTop:
                var playerstopMessage = new PlayersTopServerMessage();
                playerstopMessage.playerstop = buff.popStringFixedLength(1024);
                this.onPlayersTop(playerstopMessage);
                break;
            case ServerMessageType.PlayerSetHp:
                var playersethpMessage = new SetPlayerHpServerMessage();
                playersethpMessage.playerid = buff.popUInt32();
                playersethpMessage.playerhp = buff.popUInt8();
                this.onPlayerSetHp(playersethpMessage);
                break;
            case ServerMessageType.SetPlayerName:
                var setplayernameMessage = new SetPlayerNameServerMessage();
                setplayernameMessage.clientid = buff.popUInt32();
                setplayernameMessage.name = buff.popStringFixedLength(32);
                this.onSetPlayerName(setplayernameMessage);
                break;
            case ServerMessageType.UpdatePlayerSlots:
                var updateplayerslotsMessage = new UpdatePlayerSlotsServerMessage();
                updateplayerslotsMessage.playerid = buff.popUInt32();
                updateplayerslotsMessage.body = buff.popInt32();
                updateplayerslotsMessage.gun = buff.popInt32();
                updateplayerslotsMessage.armor = buff.popInt32();
                this.onUpdatePlayerSlots(updateplayerslotsMessage);
                break;
        }
    }
    //Message senders
    sendChatMessage(message) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.ChatMessage)
            .pushString(message, 256)
            .send(this.ws);
    }
    sendGetMapObjects(mapx, mapy) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetMapObjects)
            .pushInt32(mapx)
            .pushInt32(mapy)
            .send(this.ws);
    }
    sendGetTiles(mapx, mapy) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetTiles)
            .pushInt32(mapx)
            .pushInt32(mapy)
            .send(this.ws);
    }
    sendHitPlayer(playeid, hitpoints) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.HitPlayer)
            .pushUInt32(playeid)
            .pushInt32(hitpoints)
            .send(this.ws);
    }
    sendRespawnPlayer(playerid) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.RespawnPlayer)
            .pushUInt32(playerid)
            .send(this.ws);
    }
    sendPlayerShooting(weapon) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerShooting)
            .pushInt32(weapon)
            .send(this.ws);
    }
    sendSetPlayerName(name) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetPlayerName)
            .pushString(name, 32)
            .send(this.ws);
    }
    sendUpdatePlayerSlots(body, gun, armor) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerSlots)
            .pushInt32(body)
            .pushInt32(gun)
            .pushInt32(armor)
            .send(this.ws);
    }
    sendUpdatePlayerState(aimx, aimy, controlsstate) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerState)
            .pushFloat(aimx)
            .pushFloat(aimy)
            .pushInt32(controlsstate)
            .send(this.ws);
    }
    sendUpdatePlayerTarget(aimx, aimy) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerTarget)
            .pushFloat(aimx)
            .pushFloat(aimy)
            .send(this.ws);
    }
}
/// <reference path="WsConnection.ts" />
class WsClient extends Wsc {
    constructor() {
        super(...arguments);
        this.myPlayerName = "John Smith";
        this.playersCount = 0;
        this.players = [];
    }
    onInitPlayer(msg) {
        this.clientId = msg.clientid;
        this.sendSetPlayerName(this.myPlayerName);
        this.sendUpdatePlayerSlots(0, 0, 0);
        if (this.onGameInitCallback != undefined)
            this.onGameInitCallback();
    }
    onSetPlayerName(msg) {
        if (this.players[msg.clientid] != null) {
            this.players[msg.clientid].updateName(msg.name);
        }
    }
    onChatMessage(msg) {
        this.writeToChat(msg.clientid, msg.message);
    }
    onPlayerJoined(msg) {
        this.updatePlayer(msg.playerstatedata);
    }
    onGameState(msg) {
        const playersCount = msg.playerstatedata.length;
        for (let i = 0; i < playersCount; i++) {
            this.updatePlayer(msg.playerstatedata[i]);
        }
    }
    onPlayersMovment(msg) {
        const playersCount = msg.movmentstates.length;
        for (let i = 0; i < playersCount; i++) {
            const state = msg.movmentstates[i];
            const playerId = state.playerid;
            const p = this.players[playerId];
            if (p != undefined) {
                p.x = state.x;
                p.y = state.y;
                p.ax = state.aimx;
                p.ay = state.aimy;
                p.targetX = state.targetx;
                p.targetY = state.targety;
                p.angle = state.bodyangle;
                p.controls = state.controlsstate;
                p.speed.x = state.velocityx;
                p.speed.y = state.velocityy;
                p.animationState = state.animationstate;
                p.onStateUpdatedFromServer();
            }
        }
    }
    onMapObjects(msg) {
        if (this.onMapObjectsCallback != undefined)
            this.onMapObjectsCallback(msg.mapobjects);
    }
    //onPlayerLeft(msg: PlayerLeftServerMessage) {
    //}
    //onRespawnPlayer(msg: PlayerRespawnServerMessage) {
    //}
    //onPlayerShooting(msg: PlayerShootingServerMessage) {
    //}
    //onPlayersTop(msg: PlayersTopServerMessage) {
    //}
    //onPlayerSetHp(msg: SetPlayerHpServerMessage) {
    //}
    //onUpdatePlayerSlots(msg: UpdatePlayerSlotsServerMessage) {
    //}
    writeToChat(id, message) {
        console.log(`Message to chat from client ${id}: ${message}`);
    }
    updatePlayer(playerData) {
        let player = null;
        let isNewPlayer = false;
        const playerId = playerData.id;
        if (playerId in this.players) {
            player = this.players[playerId];
        }
        else {
            player = new Player(playerId);
            this.players[playerId] = player;
            isNewPlayer = true;
            this.playersCount++;
        }
        this.setPlayerData(player, playerData);
        if ((this.myPlayer == null || this.myPlayer == undefined) && player.id === this.clientId) {
            this.myPlayer = player;
        }
        if (isNewPlayer && this.onPlayerCreateCallback != null) {
            this.onPlayerCreateCallback(player);
        }
    }
    setPlayerData(p, pd) {
        p.name = pd.name.trim();
        p.hp = pd.hp;
        p.maxHp = pd.maxhp;
        p.body = pd.bodyindex;
        p.weapon = pd.weaponindex;
        p.armor = pd.armorindex;
        const ms = pd.movmentstate;
        p.x = ms.x;
        p.y = ms.y;
        p.ax = ms.aimx;
        p.ay = ms.aimy;
        p.angle = ms.bodyangle;
        p.controls = ms.controlsstate;
        p.speed.x = ms.velocityx;
        p.speed.y = ms.velocityy;
    }
}
//# sourceMappingURL=tsapp.js.map