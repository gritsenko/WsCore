import * as THREE from 'three';
import { Behavior } from "./Behavior";

export class Follow extends Behavior {
    target: THREE.Object3D;
    offset: THREE.Vector3;
    yRotationOffset: number;  // Changed to store only Y rotation
    
    positionLerp: number;
    rotationLerp: number;
    
    constructor(target: THREE.Object3D, options?: {
        offset?: THREE.Vector3,
        yRotationOffset?: number,
        positionLerp?: number,
        rotationLerp?: number
    }) {
        super();
        
        this.target = target;
        this.offset = options?.offset ?? new THREE.Vector3(0, 0, 0);
        this.yRotationOffset = options?.yRotationOffset ?? 0;
        this.positionLerp = options?.positionLerp ?? 0.1;
        this.rotationLerp = options?.rotationLerp ?? 0.1;
    }

    updateOffsetsFromCurrentState() {
        if (!this.target || !this.object3d) {
            console.warn('Cannot update offsets: target or object3d is not set');
            return;
        }

        // Get world positions
        const targetWorldPos = new THREE.Vector3();
        const targetWorldQuat = new THREE.Quaternion();
        this.target.getWorldPosition(targetWorldPos);
        this.target.getWorldQuaternion(targetWorldQuat);

        const objectWorldPos = new THREE.Vector3();
        this.object3d.getWorldPosition(objectWorldPos);

        // Calculate position offset in target's local space
        const worldOffset = objectWorldPos.clone().sub(targetWorldPos);
        const targetWorldQuatY = new THREE.Quaternion();
        
        // Extract only Y rotation from target's quaternion
        const targetEuler = new THREE.Euler().setFromQuaternion(targetWorldQuat);
        targetWorldQuatY.setFromEuler(new THREE.Euler(0, targetEuler.y, 0));
        
        const targetWorldQuatYInverse = targetWorldQuatY.clone().invert();
        this.offset = worldOffset.applyQuaternion(targetWorldQuatYInverse);

        // Calculate Y rotation offset
        const targetY = targetEuler.y;
        const objectY = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion().setFromEuler(this.object3d.rotation)
        ).y;

        // Calculate the difference in Y rotation
        this.yRotationOffset = objectY - targetY;
        
        // Normalize the rotation to -PI to PI range
        this.yRotationOffset = ((this.yRotationOffset + Math.PI) % (Math.PI * 2)) - Math.PI;
    }

    onTick(dt: number): void {
        if (!this.isEnabled || !this.target)
            return;

        // Get target's world transform
        const targetWorldPos = new THREE.Vector3();
        const targetWorldQuat = new THREE.Quaternion();
        
        this.target.getWorldPosition(targetWorldPos);
        this.target.getWorldQuaternion(targetWorldQuat);

        // Extract only Y rotation from target
        const targetEuler = new THREE.Euler().setFromQuaternion(targetWorldQuat);
        const targetWorldQuatY = new THREE.Quaternion();
        targetWorldQuatY.setFromEuler(new THREE.Euler(0, targetEuler.y, 0));

        // Apply offset in target's local space (considering only Y rotation)
        const offsetInWorld = this.offset.clone()
            .applyQuaternion(targetWorldQuatY);
        
        const targetPosition = targetWorldPos.clone().add(offsetInWorld);

        // Smoothly interpolate position
        this.object3d.position.lerp(targetPosition, this.positionLerp);

        // Calculate target Y rotation
        const targetYRotation = targetEuler.y + this.yRotationOffset;

        // Get current Y rotation
        const currentYRotation = new THREE.Euler().setFromQuaternion(
            new THREE.Quaternion().setFromEuler(this.object3d.rotation)
        ).y;

        // Interpolate Y rotation
        let newYRotation = currentYRotation;
        
        // Handle rotation wrapping for smooth interpolation
        let rotationDiff = targetYRotation - currentYRotation;
        if (rotationDiff > Math.PI) rotationDiff -= Math.PI * 2;
        if (rotationDiff < -Math.PI) rotationDiff += Math.PI * 2;
        
        newYRotation += rotationDiff * this.rotationLerp;

        // Apply only Y rotation, keeping X and Z at 0
        this.object3d.rotation.set(0, newYRotation, 0);
    }

    setTarget(newTarget: THREE.Object3D) {
        this.target = newTarget;
    }

    setOffset(newOffset: THREE.Vector3) {
        this.offset = newOffset;
    }

    setYRotationOffset(newOffset: number) {
        this.yRotationOffset = newOffset;
    }

    setSmoothingFactors(position: number, rotation: number) {
        this.positionLerp = THREE.MathUtils.clamp(position, 0, 1);
        this.rotationLerp = THREE.MathUtils.clamp(rotation, 0, 1);
    }
}