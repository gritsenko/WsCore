import * as THREE from 'three';
import { MoveTo } from './MoveTo';
import { Transform } from '../Runtime';

export class MoveByCheckpoints extends MoveTo {
    currentCheckpointIndex = 0;
    checkpoints: Transform[] = [];
    rotationSpeed = 0.5;
    isRotating = false;
    targetQuaternion: THREE.Quaternion = new THREE.Quaternion();
    currentCheckpoint: Transform;

    constructor(config?: any) {
        super(config.speed);

        this.checkpoints = config.checkpoints.map((item: any) => ({
            position: new THREE.Vector3(item.position.x, item.position.y, item.position.z),
            rotation: new THREE.Euler(item.rotation.x, item.rotation.y, item.rotation.z),
        }));

        this.onArrivedCallback = () => {
            const checkpoint = this.currentCheckpoint;
            if (checkpoint.rotation) {
                this.targetQuaternion.setFromEuler(checkpoint.rotation);
                this.isRotating = true;
            }
        }
    }

    onTick(deltaTime: number) {
        if (!this.isEnabled) return;

        super.onTick(deltaTime);

        if (this.isRotating) {
            if (this.object3d.quaternion.angleTo(this.targetQuaternion) > 0.3) {
                this.object3d.quaternion.slerp(this.targetQuaternion, this.rotationSpeed);
            } else {
                this.object3d.quaternion.copy(this.targetQuaternion);
                this.isRotating = false;
            }
        }
    }

    moveToNextCheckpoint() {
        this.currentCheckpoint = this.checkpoints[this.currentCheckpointIndex];
        this.currentCheckpointIndex++;

        if (this.currentCheckpoint) {
            //console.log(this.currentCheckpointIndex, this.currentCheckpoint);
            this.move(this.currentCheckpoint.position);
        }
    }
}