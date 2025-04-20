import * as THREE from "three";

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface Transform {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
    quaternion: THREE.Quaternion;
}
