import * as THREE from 'three';
import { lerp } from '../utils/Common';
import Player from './Player';

interface SpriteDef {
  file: string;
  count: number;
  frameWidth: number;
  frameHeight: number;
  rows: number;
  cols: number;
}

/**
 * The 3D visual for a Player. Owned by the GameScene in a Map<id, PlayerView>;
 * created on enter/join, disposed on exit/leave. Reads state from its Player each
 * frame in update(). Sprite-sheet textures are cached statically (shared asset),
 * but each view clones the texture it renders so every avatar animates on its own
 * UV cursor (the pre-split code mutated one shared texture → all knights in lockstep).
 */
export default class PlayerView {
  static nickOffset = 60;

  // Shared, loaded-once sprite-sheet assets. Disposed only on final app shutdown.
  static spriteSheets: Map<string, THREE.Texture> = new Map();
  static spriteDefinitions: Map<string, SpriteDef> = new Map();
  static spritesLoaded = false;

  private readonly player: Player;
  private scene: THREE.Scene | null = null;

  sprite: THREE.Sprite | null = null;
  nickText: THREE.Sprite | null = null;

  private scaleFactor = 80;
  private currentAnimationState = '';
  private currentFrame = 0;
  private frameCounter = 0;
  private frameRate = 8;
  private tilesHorizontal = 3;
  private tilesVertical = 4;
  private renderedNameVersion = -1;

  // Per-instance texture clones keyed by animation state, so UV offsets are independent.
  private clones: Map<string, THREE.Texture> = new Map();

  constructor(player: Player) {
    this.player = player;
  }

  static preload(textureLoader: THREE.TextureLoader): void {
    const defs: Record<string, SpriteDef> = {
      knight_idle: {
        file: '01_idle_sword.png',
        count: 12,
        frameWidth: 100,
        frameHeight: 100,
        rows: 3,
        cols: 4,
      },
      knight_run: {
        file: '01_run_sword.png',
        count: 8,
        frameWidth: 100,
        frameHeight: 100,
        rows: 3,
        cols: 3,
      },
    };

    let loaded = 0;
    const total = Object.keys(defs).length;
    const onLoad = () => {
      if (++loaded === total) {
        PlayerView.spritesLoaded = true;
        console.log('All player sprites loaded');
      }
    };

    for (const [key, def] of Object.entries(defs)) {
      textureLoader.load(
        `/knight/${def.file}`,
        texture => {
          PlayerView.spriteSheets.set(key, texture);
          PlayerView.spriteDefinitions.set(key, def);
          onLoad();
        },
        undefined,
        error => {
          console.error(`Failed to load sprite: ${key}`, error);
          onLoad();
        }
      );
    }
  }

  /** Dispose shared sprite-sheet assets. Call only on final app shutdown. */
  static disposeSharedAssets(): void {
    for (const tex of PlayerView.spriteSheets.values()) tex.dispose();
    PlayerView.spriteSheets.clear();
    PlayerView.spriteDefinitions.clear();
    PlayerView.spritesLoaded = false;
  }

  /** Get (or lazily create) this view's private clone of an animation texture. */
  private getClone(name: string): THREE.Texture | null {
    let clone = this.clones.get(name);
    if (clone) return clone;

    const src = PlayerView.spriteSheets.get(name);
    const def = PlayerView.spriteDefinitions.get(name);
    if (!src || !def) return null;

    clone = src.clone();
    clone.needsUpdate = true;
    clone.magFilter = THREE.NearestFilter;
    clone.minFilter = THREE.NearestFilter;
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(1 / def.cols, 1 / def.rows);
    clone.offset.set(0, 1 - 1 / def.rows);
    this.clones.set(name, clone);
    return clone;
  }

  attach(scene: THREE.Scene): void {
    this.scene = scene;
    const p = this.player;

    // Nick label doesn't depend on the sprite sheets being loaded yet.
    this.nickText = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.buildNickTexture(p.name) })
    );
    this.nickText.scale.set(60, 16, 1);
    this.nickText.position.set(p.x, 100, p.y);
    this.renderedNameVersion = p.nameVersion;
    scene.add(this.nickText);

    // Sprite needs the sheets; if not loaded yet, update() creates it lazily.
    this.ensureSprite();
  }

  /** Create the sprite once the shared sheets are available (idempotent). */
  private ensureSprite(): void {
    if (this.sprite || !this.scene || !PlayerView.spritesLoaded) return;

    const initial = this.getClone('knight_idle') || this.getClone('knight_run');
    if (!initial) return;
    const def =
      PlayerView.spriteDefinitions.get('knight_idle') ||
      PlayerView.spriteDefinitions.get('knight_run');
    if (def) {
      this.tilesHorizontal = def.cols;
      this.tilesVertical = def.rows;
    }
    const material = new THREE.SpriteMaterial({
      map: initial,
      sizeAttenuation: true,
      transparent: true,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(this.scaleFactor, this.scaleFactor, 1);
    this.sprite.position.set(this.player.x, 50, this.player.y);
    this.currentAnimationState = 'knight_idle';
    this.scene.add(this.sprite);
  }

  private buildNickTexture(name: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(name, 128, 40);
    return new THREE.CanvasTexture(canvas);
  }

  private rebuildNick(): void {
    if (!this.nickText) return;
    const mat = this.nickText.material as THREE.SpriteMaterial;
    mat.map?.dispose();
    mat.map = this.buildNickTexture(this.player.name);
    mat.needsUpdate = true;
    this.renderedNameVersion = this.player.nameVersion;
  }

  update(): void {
    const p = this.player;
    if (!this.sprite) this.ensureSprite();

    let x = p.x;
    let z = p.y;
    if (this.sprite) {
      x = lerp(this.sprite.position.x, p.x, 0.09);
      z = lerp(this.sprite.position.z, p.y, 0.09);
      this.sprite.position.set(x, 50, z);

      this.updateAnimation(p.getVelocity() > 10 ? 'knight_run' : 'knight_idle');

      // Face movement direction (flip sprite horizontally).
      if (p.targetX > x && this.sprite.scale.x < 0) {
        this.sprite.scale.x = this.scaleFactor;
      } else if (p.targetX < x && this.sprite.scale.x > 0) {
        this.sprite.scale.x = -this.scaleFactor;
      }
    }

    if (this.nickText) {
      if (this.renderedNameVersion !== p.nameVersion) this.rebuildNick();
      this.nickText.position.set(x, 100, z);
    }
  }

  private updateAnimation(stateName: string): void {
    if (!PlayerView.spritesLoaded || !this.sprite) return;
    const material = this.sprite.material as THREE.SpriteMaterial;

    if (this.currentAnimationState !== stateName) {
      const clone = this.getClone(stateName);
      const def = PlayerView.spriteDefinitions.get(stateName);
      if (clone && def) {
        material.map = clone;
        material.needsUpdate = true;
        this.tilesHorizontal = def.cols;
        this.tilesVertical = def.rows;
        this.currentAnimationState = stateName;
        this.currentFrame = 0;
        this.frameCounter = 0;
      }
    }

    const def = PlayerView.spriteDefinitions.get(stateName);
    const tex = material.map;
    if (def && tex) {
      if (++this.frameCounter >= 60 / this.frameRate) {
        this.currentFrame = (this.currentFrame + 1) % def.count;
        this.frameCounter = 0;
      }
      const col = this.currentFrame % this.tilesHorizontal;
      const row = Math.floor(this.currentFrame / this.tilesHorizontal);
      tex.offset.x = col / this.tilesHorizontal;
      tex.offset.y = (this.tilesVertical - 1 - row) / this.tilesVertical;
    }
  }

  detach(): void {
    if (this.sprite) {
      this.sprite.parent?.remove(this.sprite);
      this.sprite.material.dispose(); // clones disposed below
      this.sprite = null;
    }
    if (this.nickText) {
      this.nickText.parent?.remove(this.nickText);
      const mat = this.nickText.material as THREE.SpriteMaterial;
      mat.map?.dispose(); // per-view CanvasTexture — material.dispose() does NOT free it
      mat.dispose();
      this.nickText = null;
    }
    for (const clone of this.clones.values()) clone.dispose();
    this.clones.clear();
    this.scene = null;
  }
}
