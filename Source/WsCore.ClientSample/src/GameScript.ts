import * as THREE from "three";
import { delay } from "./Runtime";
import GameScene from "./ObjectTypes/GameScene";
import App from "./app";
import UiLayer from "./ObjectTypes/UiLayer";
import { TypeState } from "typestate";

enum States {
    Tutorial,
    Scene,
    EndGame
}

export default class GameScript {

    private fsm = new TypeState.FiniteStateMachine<States>(States.Tutorial);
    initStateMachine(fsm: TypeState.FiniteStateMachine<States>) {
        fsm.from(States.Tutorial).to(States.Scene);
        fsm.from(States.Scene).to(States.EndGame);

        if (fsm.is(States.Scene)) {
            console.log("Game started");
        }
    }

    app: App;
    mainScene: GameScene;
    soundEnabled: boolean = false;
    uiScene: UiLayer;
    ground: THREE.Mesh;
    character: THREE.Sprite;
    characterTarget: THREE.Vector3;
    characterSpeed: number = 4; // units per second
    characterMoving: boolean = false;
    characterTextures: THREE.Texture[] = [];
    characterFrame: number = 0;
    characterFrameTime: number = 0;
    characterFrameDuration: number = 0.08; // seconds per frame

    constructor(app: App) {
        this.app = app;
        this.mainScene = app.mainScene;
        this.uiScene = app.uiScene;

        this.initStateMachine(this.fsm);
        this.app.onGameReady();
        this.initGround();
        this.initCharacter();
    }

    initGround() {
        // Создаём плоскость земли, наклонённую на 45 градусов
        const geometry = new THREE.PlaneGeometry(20, 20);
        const material = new THREE.MeshStandardMaterial({ color: 0x88bb66, side: THREE.DoubleSide });
        this.ground = new THREE.Mesh(geometry, material);
        this.ground.rotation.x = -Math.PI / 4; // 45 градусов
        this.ground.position.set(0, 0, 0);
        this.ground.receiveShadow = true;
        this.mainScene.add(this.ground);
    }

    async initCharacter() {
        // Загружаем анимацию idle для человечка (knight)
        const loader = new THREE.TextureLoader();
        const frameCount = 12;
        for (let i = 1; i <= frameCount; ++i) {
            const num = i.toString().padStart(4, '0');
            const tex = await loader.loadAsync('assets/sprites/knight/01_idle_sword_' + num + '.png');
            this.characterTextures.push(tex);
        }
        const spriteMaterial = new THREE.SpriteMaterial({ map: this.characterTextures[0], transparent: true });
        this.character = new THREE.Sprite(spriteMaterial);
        this.character.position.set(0, 0.5, 0); // немного над землёй
        this.character.scale.set(1.5, 1.5, 1.5);
        this.mainScene.add(this.character);
        this.characterTarget = this.character.position.clone();
    }

    onCameraAnimationComplete(): void {
    }

    async onStartGame(): Promise<void> {
    }

    muteSounds() {
        this.app.assetLoader.muteSounds();
    }

    async runAsync(): Promise<void> {
        await delay(1000);
    }

    onTick(dt: number) {
        // Анимация спрайта
        if (this.characterTextures.length > 0 && this.character) {
            this.characterFrameTime += dt;
            if (this.characterFrameTime > this.characterFrameDuration) {
                this.characterFrameTime = 0;
                this.characterFrame = (this.characterFrame + 1) % this.characterTextures.length;
                (this.character.material as THREE.SpriteMaterial).map = this.characterTextures[this.characterFrame];
            }
        }
        // Движение человечка к цели
        if (this.characterMoving && this.character) {
            const pos = this.character.position;
            const dir = new THREE.Vector3().subVectors(this.characterTarget, pos);
            const dist = dir.length();
            if (dist > 0.05) {
                dir.normalize();
                pos.add(dir.multiplyScalar(this.characterSpeed * dt));
            } else {
                this.character.position.copy(this.characterTarget);
                this.characterMoving = false;
            }
        }
    }

    async onPointerPressed(pointer: THREE.Vector2) {
        // Клик по экрану: ищем пересечение с плоскостью земли
        if (!this.ground || !this.character) return;
        const camera = this.app.currentCamera;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(this.ground);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            this.characterTarget = point.clone();
            this.characterMoving = true;
        }
    }

    onPointerMoved(event, pointer) {
    }

    onPointerReleased(event) {
        // this.enableSound();

        // if (this.currentUpgradeIndex > 0 && this.currentUpgradeIndex < 5)
        //     this.playSound(`module${this.currentUpgradeIndex}_sound`);
    }

    enableSound() {
        if (this.soundEnabled) return;

        this.soundEnabled = true;

        const music = this.app.assetLoader.getSoundByName("music_sound");
        music.loop(true);
        music.volume(0.4);
        music.play();
    }

    playSound(name: string) {
        if (!this.soundEnabled) return;

        this.app.assetLoader.playSoundByName(name);
    }

    isTouchingObject(camera: THREE.Camera, pointer: THREE.Vector2, object: THREE.Sprite): boolean {

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(pointer, camera);
        var intersects = raycaster.intersectObject(object);
        if (intersects.length > 0) {
            //console.log('Clicked on sprite!');
            return true;
        }

        return false;
    }
}