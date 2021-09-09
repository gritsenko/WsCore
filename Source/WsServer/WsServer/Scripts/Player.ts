import { lerp, pad } from "./Common.js";
import AnimationDef from "./AnimationDef.js";
import { FiniteStateMachine } from "./TypeState.js";

enum PlayerState {
    Idle,
    Run,
    Attack,
    Die
}

export default class Player {
    static nickOffset = -60;

    id: number;
    x = 0;
    y = 0;
    ax = 0;
    ay = 0;
    targetX = 0;
    targetY = 0;
    angle = 0;
    controls = 0;
    name: string;
    speed: any;

    animationState: number;

    runPressed = false;

    xDir = 0;

    hp = 0;
    maxHp = 100;
    body = 0;
    weapon = 0;
    armor = 0;

    scaleFactor = 1;

    isMyPlayer: boolean;

    static animationKeys: AnimationDef[] = [];

    static animationsReady = false;
    fsm = new FiniteStateMachine<PlayerState>(PlayerState.Run);
    sprite: Phaser.GameObjects.Sprite;
    nickText: Phaser.GameObjects.Text;

    constructor(id) {
        this.id = id;
        this.name = "bot";
        this.speed = { x: 0, y: 0 };

        var fsm = this.fsm;

        //fsm.from(PlayerState.Idle).toAny(PlayerState);
        fsm.fromAny(PlayerState).toAny(PlayerState);

        this.fsm = fsm;

        fsm.on(PlayerState.Idle, (from: PlayerState) => {
            this.setAnimation("knight_idle");
        });
        fsm.on(PlayerState.Run, (from: PlayerState) => {
            this.setAnimation("knight_run");
        });
    }

    setAnimation(name) {
        this.sprite.play(name);
    }

    static preload(loader: any) {
        loader.load.path = "/assets/knight/";

        this.loadFrames(loader, "knight_idle", "01_idle_sword_", 12);
        this.loadFrames(loader, "knight_run", "01_run_sword_", 8);
    }

    static loadFrames(loader: any, key: string, filePrefix: string, count: number) {

        Player.animationKeys.push(new AnimationDef(key, count));

        for (let i = 1; i <= count; i++) {
            loader.load.image(key + i, filePrefix + pad(i, 4) + ".png");
        }
    }

    static initAnimations(currentScene: Phaser.Scene) {
        if (Player.animationsReady)
            return;

        Player.animationsReady = true;

        for (let i = 0; i < Player.animationKeys.length; i++ ) {
            const animDef = Player.animationKeys[i];
            const frames = [];
            for (var f = 1; f <= animDef.framesCount; f++)
                frames.push({ key: animDef.key + f } as any);

            (<any>currentScene).anims.create({
                key: animDef.key,
                frames: frames,
                frameRate: 12,
                repeat: -1
            });
        }
    }

    updateName(name: string) {
        if (this.nickText != undefined)
            this.nickText.setText(name);
    }

    init(currentScene: Phaser.Scene, isMyPlayer: boolean) {
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

    getVelocity() { return Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y) }

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

    setState(playerState: PlayerState) {
        var self = this;
        if (self.fsm.currentState !== playerState)
            self.fsm.go(playerState);
        //delay(() => {
        //    },
        //    100);
    }

    destroy() {
        const sprite = this.sprite as Phaser.GameObjects.Sprite;
        sprite.destroy();

        const nick = this.nickText as Phaser.GameObjects.Text;
        nick.destroy();
    }
}