import * as THREE from 'three';
import { Behavior } from "./Behavior";


export class MoveTo extends Behavior {
    speed: number;
    dest: THREE.Vector3;
    direction: THREE.Vector3;
    isMoving: boolean;

    onArrivedCallback: Function;
    arriveResolver: (value: void | PromiseLike<void>) => void;

    constructor(speed: number) {
        super();
        this.speed = speed;
    }

    move(dest: THREE.Vector3) {
        this.dest = dest.clone();
        this.direction = this.dest.clone().sub(this.object3d.position).normalize();

        this.isMoving = true;
    }

    stop() {
        this.dest = this.object3d.position.clone();
        this.isMoving = false;
        this.onArrived();
    }

    moveAsync(dest: THREE.Vector3): Promise<void> {
        return new Promise(resolve => {
            this.move(dest);
            this.arriveResolver = resolve;
        });
    }

    onTick(dt: any): void {
        if (!this.isEnabled || !this.isMoving)
            return;

        const step = this.speed * dt;

        this.object3d.position.add(this.direction.clone().multiplyScalar(step));

        const distance = this.object3d.position.distanceTo(this.dest);

        if (distance <= step) {
            this.object3d.position.copy(this.dest);
            this.isMoving = false;

            this.onArrived();
        }
    }

    onArrived() {
        if (this.arriveResolver != undefined) {
            this.arriveResolver();
        }

        if (this.onArrivedCallback != undefined)
            this.onArrivedCallback();
    }
}