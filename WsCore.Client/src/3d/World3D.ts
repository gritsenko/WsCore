import * as THREE from 'three';
import MapObject3D from './MapObject3D';
import { MapObjectData } from '../network/protocol/MapObjectData';

export default class World3D {
  static cellSize = 50;

  objects: MapObject3D[] = [];
  scene: THREE.Scene;
  groundPlane: THREE.Mesh;
  textureLoader: THREE.TextureLoader;

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
  }

  create(scene: THREE.Scene) {
    this.scene = scene;

    // Create ground plane with checkerboard pattern
    this.createGround();

    // Preload map object textures
    MapObject3D.preloadTextures(this.textureLoader);
  }

  createGround() {
    // Create a large plane for the ground
    const groundGeometry = new THREE.PlaneGeometry(10000, 10000);

    // Create grass texture
    const grassTexture = this.createGrassTexture();

    const material = new THREE.MeshStandardMaterial({
      map: grassTexture,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.groundPlane = new THREE.Mesh(groundGeometry, material);
    this.groundPlane.receiveShadow = true;
    this.groundPlane.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    this.groundPlane.position.set(0, 0, 0);

    this.scene.add(this.groundPlane);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 1000;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    this.scene.add(directionalLight);

    // Add hemisphere light for better overall illumination
    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x8b4513, 0.4);
    this.scene.add(hemisphereLight);
  }

  createGrassTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base grass color - darker
    ctx.fillStyle = '#1a3d0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add grass blade texture - darker shades
    ctx.fillStyle = '#2a5014';
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const width = Math.random() * 2 + 0.5;
      const height = Math.random() * 4 + 2;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    }

    // Add some lighter grass strands for variation - but still muted
    ctx.fillStyle = '#365419';
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const width = Math.random() * 1.5 + 0.3;
      const height = Math.random() * 3 + 1;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.repeat.set(4, 4);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;

    return texture;
  }

  updateMapObjects(objs: MapObjectData[]) {
    // Destroy old objects
    for (const obj of this.objects) {
      obj.destroy();
    }

    this.objects = [];

    // Create new objects
    for (let i = 0; i < objs.length; i++) {
      const mapObj = new MapObject3D();
      mapObj.create(this.scene, objs[i]);
      this.objects.push(mapObj);
    }
  }

  update() {
    // Could be used for ground updates if needed
  }

  posToCell(x) {
    return Math.floor(x / World3D.cellSize) * World3D.cellSize;
  }
}
