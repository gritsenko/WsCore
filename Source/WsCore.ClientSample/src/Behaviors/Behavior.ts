import * as THREE from 'three';

export class Behavior {
    isBehavior = true;
    object3d: THREE.Object3D;

    isEnabled = true;

    constructor() {
    }

    onTick(dt): void {

    }

    onAttach(): void { }

    static ObjectBehaviorsOnTick(object: object, dt: number) {
        if (object)
            Behavior.GetBehaviors(object)?.forEach(x => x.onTick(dt));
    }

    static AddTo(object3d, behavior: Behavior): Behavior {
        object3d.behaviors ??= [];

        behavior.object3d = object3d;
        object3d.behaviors.push(behavior);
        
        // Add to user data, used in lyout manager
        object3d.userData.behaviors = object3d.userData.behaviors || [];
        object3d.userData.behaviors.push(behavior);

        behavior.onAttach();
        return behavior;
    }

    static OnAttached(object: THREE.Object3D) {
        if (object)
            Behavior.GetBehaviors(object)?.forEach(x => x.onAttach());
    }

    static RemoveFrom(object3d, condition: (b: Behavior) => boolean) {
        var behavior = object3d.behaviors.find(condition);
        if (behavior != undefined) {
            behavior.disable();
            object3d.behaviors.splice(object3d.behaviors.indexOf(behavior), 1);
        }
    }

    static GetBehaviors(object3d): Behavior[] {
        return object3d.behaviors;
    }

    disable() {
        this.isEnabled = false;
    }

    enable() {
        this.isEnabled = true;
    }
}
