import * as THREE from 'three';
import { MapObjectData } from '../network/protocol/MapObjectData';

export default class MapObject3D {
  type = 0;
  x = 0;
  y = 0;
  sprite: THREE.Sprite;
  mesh: THREE.Group;

  static cellSize = 50; // Copy of World3D.cellSize
  static textures: Map<string, THREE.Texture> = new Map();

  static preloadTextures(loader: THREE.TextureLoader) {
    const textureLoader = loader;
    textureLoader.load('/map/objects/trees/tree_1.png', texture => {
      MapObject3D.textures.set('tree1', texture);
    });
    textureLoader.load('/map/objects/trees/tree_2.png', texture => {
      MapObject3D.textures.set('tree2', texture);
    });
    textureLoader.load('/map/objects/trees/tree_3.png', texture => {
      MapObject3D.textures.set('tree3', texture);
    });
    textureLoader.load('/map/objects/trees/tree_4.png', texture => {
      MapObject3D.textures.set('tree4', texture);
    });
  }

  create(scene: THREE.Scene, objData: MapObjectData) {
    this.x = objData.x;
    this.y = objData.y;
    this.type = objData.objectType;

    // Convert grid coordinates to world coordinates
    const x = this.x * MapObject3D.cellSize + MapObject3D.cellSize / 2;
    const z = this.y * MapObject3D.cellSize + MapObject3D.cellSize / 2;

    // Create sprite mesh with billboard behavior
    const textureKey = 'tree' + Math.min(this.type + 1, 4);
    const texture = MapObject3D.textures.get(textureKey);

    if (texture) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: true,
      });
      const sprite = new THREE.Sprite(material);

      // Scale appropriately for 3D view
      sprite.scale.set(80, 80, 1);
      sprite.position.set(x, 40, z); // Position above ground plane (which is at y=0)

      scene.add(sprite);
      this.sprite = sprite;
    } else {
      // Create a placeholder cube if texture not loaded
      const geometry = new THREE.BoxGeometry(40, 80, 40);
      const material = new THREE.MeshStandardMaterial({
        color: this.type === 0 ? 0x228b22 : 0x8b4513,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 40, z);
      scene.add(mesh);
      this.mesh = mesh;
    }
  }

  destroy() {
    if (this.sprite) {
      this.sprite.removeFromParent();
    }
    if (this.mesh) {
      this.mesh.removeFromParent();
    }
  }
}
