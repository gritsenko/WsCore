import * as Common from './Common.js';
import { TypeState } from "./typestate.js";
import { AnimationDef } from './AnimationDef.js';

var PlayerState;
(function (PlayerState) {
    PlayerState[PlayerState["Idle"] = 0] = "Idle";
    PlayerState[PlayerState["Run"] = 1] = "Run";
    PlayerState[PlayerState["Attack"] = 2] = "Attack";
    PlayerState[PlayerState["Die"] = 3] = "Die";
})(PlayerState || (PlayerState = {}));
export default class Player {

    static nickOffset = -60;
    static animationKeys = [];
    static animationsReady = false;

    x = 0;
    y = 0;
    ax = 0;
    ay = 0;
    targetX = 0;
    targetY = 0;
    angle = 0;
    controls = 0;
    runPressed = false;
    xDir = 0;
    hp = 0;
    maxHp = 100;
    body = 0;
    weapon = 0;
    armor = 0;
    scaleFactor = 1;
    name = "bot";
    speed = { x: 0, y: 0 };

    constructor(id) {
        this.id = id;
        const fsm = new TypeState.FiniteStateMachine(PlayerState.Run);
        fsm.fromAny(PlayerState).toAny(PlayerState);
        this.fsm = fsm;
        fsm.on(PlayerState.Idle, (from) => {
            this.setAnimation("knight_idle");
        });
        fsm.on(PlayerState.Run, (from) => {
            this.setAnimation("knight_run");
        });
        this.fsm = fsm;
    }

    setAnimation(name) {
        this.sprite.play(name);
    }

    static preload(loader) {
        loader.load.path = "/assets/knight/";
        this.loadFrames(loader, "knight_idle", "01_idle_sword_", 12);
        this.loadFrames(loader, "knight_run", "01_run_sword_", 8);
    }

    static loadFrames(loader, key, filePrefix, count) {
        Player.animationKeys.push(new AnimationDef(key, count));
        for (let i = 1; i <= count; i++) {
            loader.load.image(key + i, filePrefix + Common.pad(i, 4) + ".png");
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

    getVelocity() {
        return Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y);
    }

    update() {
        const sprite = this.sprite;
        if (sprite == undefined)
            return;
        sprite.x = Common.lerp(sprite.x, this.x, 0.09);
        sprite.y = Common.lerp(sprite.y, this.y, 0.09);
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
    destroy() {
        const sprite = this.sprite;
        sprite.destroy();
        const nick = this.nickText;
        nick.destroy();
    }
}

