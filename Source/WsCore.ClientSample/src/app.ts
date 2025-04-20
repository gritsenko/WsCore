import * as THREE from 'three';

import SceneLoader from './Runtime/SceneLoader';
import AssetLoader from './Runtime/AssetLoader'
import GameScript from './GameScript';
import { Behavior } from './Behaviors/Behavior';

// import { EditMode } from './EditMode';
import GameScene from './ObjectTypes/GameScene';
import UiLayer from './ObjectTypes/UiLayer';

export default class App {
    clock: THREE.Clock;
    pointer: THREE.Vector2;
    renderer: THREE.WebGLRenderer;
    uiCamera: THREE.OrthographicCamera;
    assetLoader: AssetLoader = new AssetLoader();
    mainScene: GameScene;
    uiScene: UiLayer;
    gameScript: GameScript;

    mainCamera: THREE.PerspectiveCamera;
    currentCamera: THREE.PerspectiveCamera;
    constructor() {
    }

    async init() {

        await this.assetLoader.loadAssets();

        this.clock = new THREE.Clock();
        this.pointer = new THREE.Vector2();

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.uiCamera = new THREE.OrthographicCamera(- width / 2, width / 2, height / 2, - height / 2, 0.1, 1000);
        this.uiCamera.position.z = 10;

        this.mainCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

        this.currentCamera = this.mainCamera;

        const renderer = new THREE.WebGLRenderer();
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer = renderer;
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.autoClear = false; // To allow render overlay on top of sprited sphere
        //renderer.sortObjects = true; 
        //renderer.shadowMap.enabled = true;

        document.body.appendChild(renderer.domElement);

        //create scenes
        this.mainScene = (new SceneLoader(this.assetLoader)).loadSceneFromJson(this.assetLoader.levelJson);
        this.mainScene.init(this.mainCamera);

        this.uiScene = new UiLayer(this.assetLoader);
        this.uiScene.init();

        this.animate();

        this.gameScript = new GameScript(this);

        //this.setMainCamera(this.gameScript.camera);
        
        window.addEventListener('resize', () => this.onWindowResize());
        document.addEventListener('contextmenu', event => event.preventDefault());
        document.addEventListener('pointerdown', e => this.onPointerPressed(e));
        document.addEventListener('pointerup', e => this.onPointerReleased(e));
        document.addEventListener('pointermove', e => this.onPointerMove(e));

        // EditMode.enableEditor(this);
    }

    setMainCamera(gameCamera: THREE.Camera) {
        if (gameCamera instanceof THREE.PerspectiveCamera) {
            this.mainCamera = gameCamera;
            this.currentCamera = gameCamera;
            this.onWindowResize();
        }
    }

    overrideCamera(camera: THREE.PerspectiveCamera) {
        this.currentCamera = camera;
    }

    resetCamera() {
        this.currentCamera = this.mainCamera; ``
    }

    animate() {
        const dt = this.clock.getDelta();
        this.gameScript?.onTick(dt);
        [this.mainScene, this.uiScene].forEach(x => x.onTick(dt));
        Behavior.ObjectBehaviorsOnTick(this.mainCamera, dt); //camera is not part of scene

        const renderer = this.renderer;
        renderer.clear();
        renderer.render(this.mainScene, this.currentCamera);
        renderer.clearDepth();
        renderer.render(this.uiScene, this.uiCamera);

        requestAnimationFrame(() => this.animate());
    }

    onWindowResize() {

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.currentCamera.aspect = width / height;
        this.currentCamera.updateProjectionMatrix();

        this.uiCamera.left = - width / 2;
        this.uiCamera.right = width / 2;
        this.uiCamera.top = height / 2;
        this.uiCamera.bottom = - height / 2;
        this.uiCamera.updateProjectionMatrix();

        //this.gameScript?.onWindowResize(width, height);

        this.uiScene.updateLayout();

        this.renderer.setSize(window.innerWidth, window.innerHeight);

    }

    onPointerPressed(event) {
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.gameScript.onPointerPressed(this.pointer);
    }


    onPointerMove(event) {
        this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
        this.gameScript.onPointerMoved(event, this.pointer);
    }

    onPointerReleased(event) {
        this.gameScript.onPointerReleased(event);
    }

    callCta() {
        this.onGameEnd();
        document["CTA"]?.onClick?.();
    }

    onGameEnd() {
        document["CTA"]?.gameEnd?.();
    }

    onGameReady() {
        console.log("game ready");
        document["CTA"]?.gameReady?.();
    }
}

function startGame() {
    const app = new App();
    app.init();
}

const cta = (document as any).CTA as any;
if (cta?.platform != "is") { //iron source hack
    startGame();
} else if (cta != undefined) {
    cta["startGame"] = startGame;
}