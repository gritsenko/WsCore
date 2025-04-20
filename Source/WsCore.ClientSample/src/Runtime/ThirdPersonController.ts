import * as THREE from 'three';
import GameObject from '../ObjectTypes/GameObject';
import GameScene from '../ObjectTypes/GameScene';
import { GameObjectCollider } from '../ObjectTypes/GameObjectCollider';

export class ThirdPersonController {
    isActive = true;

    dx: number;
    dy: number;
    oldPointerPos: THREE.Vector2 = new THREE.Vector2();
    initialPointer: THREE.Vector2;
    targetPosition: THREE.Vector3 = new THREE.Vector3();
    raycaster: THREE.Raycaster;

    // Following properties
    private readonly followDistance = 1;
    private readonly followHeight = 1.6; // Adjusted to be more natural
    private readonly targetHeight = 1.6; // Height of player's "eyes"
    private readonly followLerp = 0.03;
    private readonly rotationLerp = 0.9;

    aimHelper: THREE.AxesHelper;
    originHelper: THREE.AxesHelper;
    cameraHelper: THREE.CameraHelper;

    // Camera shake properties
    private shakeIntensity: number = 0;
    private shakeDecay: number = 0.9;
    private shakeOffset: THREE.Vector3 = new THREE.Vector3();
    private originalCameraPosition: THREE.Vector3 = new THREE.Vector3();

    constructor(
        private camera: THREE.Camera,
        private player: THREE.Object3D,
        private scene: GameScene
    ) {
        this.raycaster = new THREE.Raycaster();
        this.aimHelper = new THREE.AxesHelper(3);
        this.originHelper = new THREE.AxesHelper(3);
        this.aimHelper.position.set(0, 1.5, 15);
        this.originHelper.position.set(-0.35, this.followHeight, -this.followDistance);

        this.aimHelper.visible = false;
        this.originHelper.visible = false;

        this.player.add(this.aimHelper);
        this.player.add(this.originHelper);

        const pos = this.originHelper.localToWorld(new THREE.Vector3());
        const lookAtTarget = this.aimHelper.localToWorld(new THREE.Vector3());
        this.camera.position.set(pos.x, pos.y, pos.z);
        this.camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);

        // this.cameraHelper = new THREE.CameraHelper(this.camera);
        // this.scene.add(this.cameraHelper);
    }

    update() {
        if (!this.isActive) return;

        const pos = this.originHelper.localToWorld(new THREE.Vector3());
        const lookAtPos = this.aimHelper.localToWorld(new THREE.Vector3());

        // Store the intended camera position before shake
        this.originalCameraPosition.copy(pos);

        // Apply camera shake if active
        if (this.shakeIntensity > 0.001) {
            this.shakeOffset.set(
                (Math.random() - 0.5) * this.shakeIntensity,
                (Math.random() - 0.5) * this.shakeIntensity,
                (Math.random() - 0.5) * this.shakeIntensity
            );

            // Apply shake offset to position
            pos.add(this.shakeOffset);

            // Decay the shake intensity
            this.shakeIntensity *= this.shakeDecay;
        } else {
            this.shakeIntensity = 0;
            this.shakeOffset.set(0, 0, 0);
        }

        // Smooth lerp movement for the camera
        this.camera.position.lerp(pos, this.followLerp);

        // Smoothly rotate the camera to look at the target position
        const currentLookAt = new THREE.Vector3();
        this.camera.getWorldDirection(currentLookAt);
        const smoothLookAt = currentLookAt.lerp(lookAtPos.clone().sub(this.originalCameraPosition).normalize(), this.rotationLerp);
        const lookAtTarget = this.originalCameraPosition.clone().add(smoothLookAt);

        this.camera.lookAt(lookAtTarget.x, lookAtTarget.y, lookAtTarget.z);
    }

    /**
     * Trigger a camera shake effect
     * @param intensity Initial intensity of the shake (recommended: 0.1 to 1.0)
     * @param decay Rate at which the shake fades out (default: 0.9)
     */
    shake(intensity: number = 0.5, decay: number = 0.9) {
        this.shakeIntensity = intensity;
        this.shakeDecay = decay;
    }

    onPointerPressed(pointer: THREE.Vector2) {
        if (!this.isActive) return;

        this.initialPointer = pointer.clone();
        this.oldPointerPos = pointer.clone();

        this.dx = 0;
        this.dy = 0;
    }

    onPointerMoved(pointerPos: THREE.Vector2) {
        if (!this.isActive) return;

        this.dx = (pointerPos.x - this.oldPointerPos.x) * 10;
        this.dy = (pointerPos.y - this.oldPointerPos.y) * 10;

        const newX = THREE.MathUtils.clamp(this.aimHelper.position.x - this.dx, -4, 4);
        const newY = THREE.MathUtils.clamp(this.aimHelper.position.y + this.dy, -1, 4);

        this.aimHelper.position.set(newX, newY, this.aimHelper.position.z);

        this.oldPointerPos = pointerPos.clone();
    }

    onPointerReleased() {
        if (!this.isActive) return;

        this.dx = 0;
        this.dy = 0;
    }

    getAimedObject(scene: GameScene, enemies: GameObject[]): GameObject | undefined {
        const center = new THREE.Vector2();
        this.raycaster.setFromCamera(center, this.camera);

        const intersects = this.raycaster.intersectObject(scene, true);
        if (intersects.length > 0) {
            const gameObjects = intersects
                .filter((i) => i?.object instanceof GameObjectCollider)
                .map((i) => (i.object as GameObjectCollider).gameObject);

            for (let i = 0; i < enemies.length; i++) {
                const enemy = enemies[i];
                if (gameObjects.find((g) => g === enemy))
                    return enemy;
            }
        }
        return undefined;
    }

    getAimPos() {
        return this.aimHelper.localToWorld(new THREE.Vector3());
    }

    enable() {
        this.isActive = true;
        this.dx = 0;
        this.dy = 0;
    }

    disable() {
        this.isActive = false;
    }
}