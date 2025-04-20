import * as THREE from 'three';
import { Behavior } from '../Behaviors/Behavior';
import { Transform } from '../Runtime';
import { GameObjectCollider } from './GameObjectCollider';

export default class GameObject extends THREE.Object3D {
    animationAction: THREE.AnimationAction | undefined;
    mixer: THREE.AnimationMixer | undefined;
    model: THREE.Object3D;
    collider: GameObjectCollider;
    animations: THREE.AnimationClip[] = [];
    currentAnimationName: string | undefined;
    behaviors: Behavior[] = [];
    isActive: boolean = true;
    modelName: string;
    private onAnimationComplete: (() => void) | undefined;

    constructor(model: THREE.Object3D, transform: Transform, Animations: THREE.AnimationClip[]) {
        super();
        this.model = model;
        this.mixer = new THREE.AnimationMixer(model);
        this.animations = Animations;

        this.setTransform(transform);
        this.add(this.model);
        // console.log(this);
    }

    setTransform(transform: Transform) {
        this.position.copy(transform.position);
        this.rotation.copy(transform.rotation);
        this.scale.copy(transform.scale);
        //this.quaternion.copy(transform.quaternion);
    }

    update(dt: number) {
        this.mixer?.update(dt);
    }

    playAnimation(animName: string, loop: THREE.AnimationActionLoopStyles = THREE.LoopRepeat, onComplete?: () => void) {
        const oldAction = this.animationAction;
        if (this.mixer == undefined)
            return;

        // Clear any existing animation complete handlers
        if (this.onAnimationComplete) {
            this.mixer.removeEventListener('finished', this.onAnimationComplete);
            this.onAnimationComplete = undefined;
        }

        this.mixer.timeScale = 1;

        const anim = this.animations.find(x => x.name.toLocaleLowerCase() == animName.toLocaleLowerCase());
        if (anim == undefined)
            return;

        oldAction?.fadeOut(0.2);

        const action = this.mixer.clipAction(anim);
        action.loop = loop;
        action.clampWhenFinished = true;
        action.play();

        oldAction?.reset();
        if (action !== oldAction)
            oldAction?.stop();

        this.animationAction = action;
        this.currentAnimationName = animName;

        // If this is a OneShot animation and we have a completion callback
        if (loop === THREE.LoopOnce && onComplete) {
            this.onAnimationComplete = () => {
                onComplete();
                // Clear the handler after it's called
                if (this.onAnimationComplete) {
                    this.mixer?.removeEventListener('finished', this.onAnimationComplete);
                    this.onAnimationComplete = undefined;
                }
            };

            // Add the event listener to the mixer
            this.mixer.addEventListener('finished', this.onAnimationComplete);
        }
    }

    setCurrentAnimationTime(time: number) {
        if (this.animationAction)
            this.animationAction.time = time;
    }

    getCurrentAnimationTime = () => this.animationAction?.time ?? 0;

    getAnimationDuration(animationName: string) {
        const anim = this.animations.find(x => x.name.toLocaleLowerCase() == animationName.toLocaleLowerCase());
        return anim?.duration ?? 0;
    }

    pauseAnimation() {
        if (this.mixer)
            this.mixer.timeScale = 0;
    }

    setCollider(collider: GameObjectCollider) {
        this.collider = collider;
        this.add(collider);
        collider.gameObject = this;
    }
    setBehaviors(behaviors: Behavior[]) {
        this.behaviors = behaviors;

        behaviors.forEach(b => b.object3d = this);
    }

    removeCollider() {
        this.remove(this.collider);
    }

    getMeshByName(name: string) {
        const rootModel = this.model;
        return rootModel.getObjectByName(name);
    }
}

