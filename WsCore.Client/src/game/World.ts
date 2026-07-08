import * as THREE from 'three';
import MapObject from './MapObject';
import { MapObjectData } from '../network/protocol/MapObjectData';

export default class World {
  static cellSize = 50;

  objects: MapObject[] = [];
  // Set by create(), not the constructor — a two-phase init the whole class relies on.
  scene!: THREE.Scene;
  textureLoader: THREE.TextureLoader;

  // Kept as fields so dispose() can free every GPU resource this world created.
  private groundPlane: THREE.Mesh | null = null;
  private groundGeometry: THREE.PlaneGeometry | null = null;
  private groundMaterial: THREE.MeshStandardMaterial | null = null;
  private grassTexture: THREE.Texture | null = null;
  private lights: THREE.Light[] = [];

  constructor() {
    this.textureLoader = new THREE.TextureLoader();
  }

  create(scene: THREE.Scene) {
    this.scene = scene;

    // Create ground plane with checkerboard pattern
    this.createGround();

    // Preload map object textures
    MapObject.preloadTextures(this.textureLoader);
  }

  createGround() {
    // Create a large plane for the ground
    this.groundGeometry = new THREE.PlaneGeometry(10000, 10000);

    // Create grass texture
    this.grassTexture = this.createGrassTexture();

    this.groundMaterial = new THREE.MeshStandardMaterial({
      map: this.grassTexture,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.groundPlane = new THREE.Mesh(this.groundGeometry, this.groundMaterial);
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

    this.lights = [ambientLight, directionalLight, hemisphereLight];
  }

  createGrassTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

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

  updateMapObjects(objs: (MapObjectData | null)[] | null) {
    // Destroy old objects
    for (const obj of this.objects) {
      obj.destroy();
    }
    this.objects = [];

    if (!objs) return; // guard: server may send a null map payload (audit §4.9)

    // Create new objects
    for (const data of objs) {
      if (!data) continue;
      const mapObj = new MapObject();
      mapObj.create(this.scene, data);
      this.objects.push(mapObj);
    }
  }

  update() {
    // Could be used for ground updates if needed
  }

  posToCell(x: number): number {
    return Math.floor(x / World.cellSize) * World.cellSize;
  }

  /**
   * Release everything create()/updateMapObjects() added to the scene. The static
   * MapObject texture cache is a shared asset and is NOT disposed here.
   */
  dispose() {
    for (const obj of this.objects) obj.destroy();
    this.objects = [];

    if (this.groundPlane) {
      this.groundPlane.parent?.remove(this.groundPlane);
      this.groundPlane = null;
    }
    this.groundGeometry?.dispose();
    this.groundMaterial?.dispose();
    this.grassTexture?.dispose();
    this.groundGeometry = null;
    this.groundMaterial = null;
    this.grassTexture = null;

    for (const light of this.lights) {
      light.parent?.remove(light);
      // DirectionalLight.dispose() cascades into shadow.dispose(), which frees the
      // 2048×2048 shadow map render target — no manual shadow/map plumbing needed.
      light.dispose();
    }
    this.lights = [];

    this.scene = null as any;
  }
}
