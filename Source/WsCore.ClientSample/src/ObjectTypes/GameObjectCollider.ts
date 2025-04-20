import * as THREE from 'three';
import GameObject from './GameObject';

export class GameObjectCollider extends THREE.Mesh {
    
    gameObject?: GameObject;

    constructor() {
        const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        super(geometry, material);
        this.visible = false;
    }
}
