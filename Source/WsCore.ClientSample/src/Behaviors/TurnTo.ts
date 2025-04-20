import * as THREE from 'three';
import { Behavior } from "./Behavior";


export class TurnTo extends Behavior {
    speed: number;
    dest: THREE.Quaternion;
    direction: THREE.Vector3;
    isTurning: boolean;

    onTurnCallback: Function;
    turnedResolver: (value: void | PromiseLike<void>) => void;
    t: number;

    constructor(speed: number) {
        super();
        this.speed = speed;
    }

    turn(destQuaternion: THREE.Quaternion, t = 0.1) {
        this.t = t;
        this.dest = destQuaternion.clone();
        this.isTurning = true;
    }

    turnTo(destLookAt: THREE.Vector3, t = 0.1) {
        this.t = t;
        const currentPosition = this.object3d.position;
        
        // Calculate direction vector from current position to target
        const toTarget = new THREE.Vector3()
            .subVectors(currentPosition, destLookAt);
        
        // Get the angle in the XZ plane (Y-rotation)
        const angleY = Math.atan2(toTarget.x, toTarget.z);
        
        // Create quaternion for Y-rotation only
        const destQuaternion = new THREE.Quaternion();
        destQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleY);
        
        this.dest = destQuaternion;
        this.isTurning = true;
    }

    stop() {
        this.dest = this.object3d.quaternion.clone();
        this.isTurning = false;
        this.onTurned();
    }

    moveAsync(destQuaternion: THREE.Quaternion): Promise<void> {
        return new Promise(resolve => {
            this.turn(destQuaternion);
            this.turnedResolver = resolve;
        });
    }

    onTick(dt: any): void {
        if (!this.isEnabled || !this.isTurning)
            return;

        this.object3d.quaternion.slerp(this.dest, this.t);

        const distance = this.object3d.quaternion.angleTo(this.dest);

        if (distance <= 0.01) {
            this.object3d.quaternion.copy(this.dest);
            this.isTurning = false;

            this.onTurned();
        }
    }

    onTurned() {
        if (this.turnedResolver != undefined) {
            this.turnedResolver();
        }

        if (this.onTurnCallback != undefined)
            this.onTurnCallback();
    }
}
