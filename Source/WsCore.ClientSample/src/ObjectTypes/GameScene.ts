import * as THREE from 'three';
import GameObject from './GameObject';
import { Behavior } from '../Behaviors/Behavior';

export interface IGameScene {
    onTick(dt);
}

export default class GameScene extends THREE.Scene implements IGameScene {
    private gameObjects: GameObject[] = [];

    constructor() {
        super();

        this.background = new THREE.Color(0x444444);
    }

    init(camera: THREE.Camera) {
        this.addBasicLights(camera);
        this.addHemisphereLight();
    }

    addBasicLights(camera: THREE.Camera) {
        // Ambient light - provides global illumination
        const ambientLight = new THREE.AmbientLight('#FFFFFF', 1.6); // color, intensity
        ambientLight.name = 'ambient_light';

        // Directional light - mimics sunlight
        const directionalLight = new THREE.DirectionalLight('#FFFFFF', 2 * Math.PI); // color, intensity
        directionalLight.name = 'main_light';
        //const directionalHelper = new THREE.DirectionalLightHelper(directionalLight, 5); // size of the helper
        //this.add(directionalHelper);

        this.add(ambientLight);
        directionalLight.position.set(0.5, 4.3, 0.866); // ~60º angle
        //directionalLight.rotation.set(camera.rotation.x, camera.rotation.y, camera.rotation.z);
        this.add(directionalLight);


        return [ambientLight, directionalLight];
    }

    // Option 2: Simple hemisphere lighting setup
    addHemisphereLight() {
        const hemiLight = new THREE.HemisphereLight();
        hemiLight.name = 'hemi_light';
        this.add(hemiLight);

        return [hemiLight];
    }
    setGameObjects(gameObjects: GameObject[]) {
        this.gameObjects = gameObjects;

        gameObjects.forEach(x => {
            if (x) this.add(x);
        });
    }

    addGameObject(gameObject: GameObject) {
        if (gameObject) {
            this.gameObjects.push(gameObject);
            this.add(gameObject);
        }
    }

    getGameObjects() {
        return this.gameObjects;
    }

    findbjectByName(name: string): GameObject {
        const result = this.gameObjects.find(x => x.name == name);
        if (result)
            return result;
        else
            throw new Error(`GameObject ${name} not found`);
    }

    onTick(dt) {
        this.children.forEach(x => {
            if (x instanceof GameObject && x.isActive) {
                x.update(dt);
            }

            Behavior.ObjectBehaviorsOnTick(x, dt);
        });
    }
}