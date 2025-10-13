import { lerp, pad } from "./Common.js";
import AnimationDef from "./AnimationDef.js";
import { FiniteStateMachine } from "./TypeState.js";
var PlayerState;
(function (PlayerState) {
    PlayerState[PlayerState["Idle"] = 0] = "Idle";
    PlayerState[PlayerState["Run"] = 1] = "Run";
    PlayerState[PlayerState["Attack"] = 2] = "Attack";
    PlayerState[PlayerState["Die"] = 3] = "Die";
})(PlayerState || (PlayerState = {}));
var Player = /** @class */ (function () {
    function Player(id) {
        var _this = this;
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
        this.fsm = new FiniteStateMachine(PlayerState.Run);
        this.id = id;
        this.name = "bot";
        this.speed = { x: 0, y: 0 };
        var fsm = this.fsm;
        //fsm.from(PlayerState.Idle).toAny(PlayerState);
        fsm.fromAny(PlayerState).toAny(PlayerState);
        this.fsm = fsm;
        fsm.on(PlayerState.Idle, function (from) {
            _this.setAnimation("knight_idle");
        });
        fsm.on(PlayerState.Run, function (from) {
            _this.setAnimation("knight_run");
        });
    }
    Player.prototype.setAnimation = function (name) {
        this.sprite.play(name);
    };
    Player.preload = function (loader) {
        loader.load.path = "/assets/knight/";
        this.loadFrames(loader, "knight_idle", "01_idle_sword_", 12);
        this.loadFrames(loader, "knight_run", "01_run_sword_", 8);
    };
    Player.loadFrames = function (loader, key, filePrefix, count) {
        Player.animationKeys.push(new AnimationDef(key, count));
        for (var i = 1; i <= count; i++) {
            loader.load.image(key + i, filePrefix + pad(i, 4) + ".png");
        }
    };
    Player.initAnimations = function (currentScene) {
        if (Player.animationsReady)
            return;
        Player.animationsReady = true;
        for (var i = 0; i < Player.animationKeys.length; i++) {
            var animDef = Player.animationKeys[i];
            var frames_1 = [];
            for (var f = 1; f <= animDef.framesCount; f++)
                frames_1.push({ key: animDef.key + f });
            currentScene.anims.create({
                key: animDef.key,
                frames: frames_1,
                frameRate: 12,
                repeat: -1
            });
        }
    };
    Player.prototype.updateName = function (name) {
        if (this.nickText != undefined)
            this.nickText.setText(name);
    };
    Player.prototype.init = function (currentScene, isMyPlayer) {
        this.isMyPlayer = isMyPlayer;
        Player.initAnimations(currentScene);
        var sprite = currentScene.add.sprite(this.x, this.y, "knight_idle1");
        var nickText = currentScene.add.text(this.x, this.y - Player.nickOffset, this.name);
        if (isMyPlayer)
            currentScene.cameras.main.startFollow(sprite);
        this.nickText = nickText;
        if (this.name.substr(0, 1) === "@") {
            sprite.alpha = 0.8;
        }
        this.sprite = sprite;
        sprite.setScale(this.scaleFactor);
        this.fsm.go(PlayerState.Idle);
    };
    Player.prototype.dist = function (v1, v2) {
        var vv = { x: v2.x - v1.x, y: v2.y - v1.y };
        return Math.sqrt(vv.x * vv.x + vv.y * vv.y);
    };
    Player.prototype.getVelocity = function () { return Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y); };
    Player.prototype.update = function () {
        var sprite = this.sprite;
        if (sprite == undefined)
            return;
        sprite.x = lerp(sprite.x, this.x, 0.09);
        sprite.y = lerp(sprite.y, this.y, 0.09);
        sprite.depth = sprite.y + sprite.height;
        this.nickText.depth = sprite.depth;
        this.nickText.x = sprite.x - this.nickText.width / 2;
        this.nickText.y = sprite.y + Player.nickOffset;
    };
    Player.prototype.onStateUpdatedFromServer = function () {
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
    };
    Player.prototype.updateDirection = function () {
        if (this.targetX > this.sprite.x && this.sprite.scaleX < this.scaleFactor) {
            this.sprite.scaleX = this.scaleFactor;
        }
        if (this.targetX < this.sprite.x && this.sprite.scaleX > -this.scaleFactor) {
            this.sprite.scaleX = -this.scaleFactor;
        }
    };
    Player.prototype.setState = function (playerState) {
        var self = this;
        if (self.fsm.currentState !== playerState)
            self.fsm.go(playerState);
        //delay(() => {
        //    },
        //    100);
    };
    Player.prototype.destroy = function () {
        var sprite = this.sprite;
        sprite.destroy();
        var nick = this.nickText;
        nick.destroy();
    };
    Player.nickOffset = -60;
    Player.animationKeys = [];
    Player.animationsReady = false;
    return Player;
}());
export default Player;
//# sourceMappingURL=Player.js.map