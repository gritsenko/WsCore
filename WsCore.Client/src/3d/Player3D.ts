import * as THREE from 'three';
import { lerp } from '../utils/Common';
import { FiniteStateMachine } from '../utils/TypeState';
import { IPlayer } from '../network/WsClient';

enum PlayerState {
  Idle,
  Run,
  Attack,
  Die,
}

export default class Player3D implements IPlayer {
  static nickOffset = 60;

  id: number;
  x = 0;
  y = 0;
  ax = 0;
  ay = 0;
  targetX = 0;
  targetY = 0;
  angle = 0;
  controls = 0;
  name: string;
  speed: any;

  animationState: number;
  runPressed = false;
  xDir = 0;

  hp = 0;
  maxHp = 100;
  body = 0;
  weapon = 0;
  armor = 0;

  scaleFactor = 80;
  isMyPlayer: boolean;

  static spriteSheets: Map<string, THREE.Texture> = new Map();
  static spriteDefinitions: Map<string, any> = new Map();
  static spritesLoaded = false;

  fsm = new FiniteStateMachine<PlayerState>(PlayerState.Run);
  sprite: THREE.Sprite;
  nickText: THREE.Sprite;
  currentFrame = 0;
  frameCounter = 0;
  frameRate = 8;
  currentAnimationState = '';
  tilesHorizontal = 3;
  tilesVertical = 4;

  constructor(id) {
    this.id = id;
    this.name = 'bot';
    this.speed = { x: 0, y: 0 };

    console.log(`[Player3D.constructor] Creating player ${id}`);

    const fsm = this.fsm;
    fsm.fromAny(PlayerState).toAny(PlayerState);

    fsm.on(PlayerState.Idle, () => {
      this.setAnimation('knight_idle');
    });
    fsm.on(PlayerState.Run, () => {
      this.setAnimation('knight_run');
    });
  }

  setAnimation(name) {
    // Animation name stored for state management
    // Actual animation updates happen in update()
  }

  static preload(textureLoader: THREE.TextureLoader) {
    // Load sprite sheets
    const spriteDefinitions = {
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

    let loadedCount = 0;
    const totalToLoad = Object.keys(spriteDefinitions).length;

    const onLoad = () => {
      loadedCount++;
      if (loadedCount === totalToLoad) {
        Player3D.spritesLoaded = true;
        console.log('All player sprites loaded');
      }
    };

    for (const [key, def] of Object.entries(spriteDefinitions)) {
      textureLoader.load(
        `/knight/${def['file']}`,
        texture => {
          console.log(`Loaded sprite: ${key}`);
          Player3D.spriteSheets.set(key, texture);
          Player3D.spriteDefinitions.set(key, def);
          onLoad();
        },
        undefined,
        error => {
          console.error(`Failed to load sprite: ${key}`, error);
          onLoad(); // Still call onLoad to prevent hanging
        }
      );
    }
  }

  init(scene: THREE.Scene, isMyPlayer: boolean) {
    this.isMyPlayer = isMyPlayer;
    console.log(
      `[Player3D.init] Player ${this.id} ${this.name}, isMyPlayer=${isMyPlayer}, pos=(${this.x}, ${this.y})`
    );

    // Load initial sprite texture
    const initialTexture =
      Player3D.spriteSheets.get('knight_idle') || Player3D.spriteSheets.get('knight_run');

    if (initialTexture) {
      // Get the definition for the initial animation to set correct tile dimensions
      const initialDef =
        Player3D.spriteDefinitions.get('knight_idle') ||
        Player3D.spriteDefinitions.get('knight_run');

      if (initialDef) {
        this.tilesHorizontal = initialDef.cols;
        this.tilesVertical = initialDef.rows;
      }

      // Configure texture for sprite sheet animation
      initialTexture.magFilter = THREE.NearestFilter;
      initialTexture.minFilter = THREE.NearestFilter;
      initialTexture.wrapS = THREE.RepeatWrapping;
      initialTexture.wrapT = THREE.RepeatWrapping;
      initialTexture.repeat.set(1 / this.tilesHorizontal, 1 / this.tilesVertical);
      initialTexture.offset.set(0, 1 - 1 / this.tilesVertical);

      const material = new THREE.SpriteMaterial({
        map: initialTexture,
        sizeAttenuation: true,
        transparent: true,
      });
      this.sprite = new THREE.Sprite(material);
      this.sprite.scale.set(80, 80, 1);
      this.sprite.position.set(this.x, 40, this.y);

      scene.add(this.sprite);
      this.currentAnimationState = 'knight_idle';
    }

    // Create nick text
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, 128, 40);

    const textTexture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.SpriteMaterial({ map: textTexture });
    this.nickText = new THREE.Sprite(textMaterial);
    this.nickText.scale.set(1.5, 0.4, 1);
    this.nickText.position.set(this.x, -this.y + Player3D.nickOffset / 50, this.y / 100 + 1);

    scene.add(this.nickText);

    this.fsm.go(PlayerState.Idle);
  }

  updateName(name: string) {
    this.name = name;
    // Redraw canvas text
    if (this.nickText) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'black';
      ctx.font = '32px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.name, 128, 40);

      const textTexture = new THREE.CanvasTexture(canvas);
      const textMaterial = new THREE.SpriteMaterial({ map: textTexture });
      if (this.nickText.material instanceof THREE.SpriteMaterial) {
        (this.nickText.material as THREE.SpriteMaterial).map?.dispose();
      }
      this.nickText.material = textMaterial;
    }
  }

  dist(v1: { x: number; y: number }, v2: { x: number; y: number }) {
    const vv = { x: v2.x - v1.x, y: v2.y - v1.y };
    return Math.sqrt(vv.x * vv.x + vv.y * vv.y);
  }

  getVelocity() {
    return Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y);
  }

  updateAnimation() {
    // Only update if sprites are loaded
    if (!Player3D.spritesLoaded || !this.sprite) return;

    const stateName = this.fsm.currentState === PlayerState.Idle ? 'knight_idle' : 'knight_run';

    // Switch texture if animation state changed
    if (this.currentAnimationState !== stateName) {
      const newTexture = Player3D.spriteSheets.get(stateName);
      const def = Player3D.spriteDefinitions.get(stateName);

      if (newTexture && def) {
        // Configure new texture
        newTexture.magFilter = THREE.NearestFilter;
        newTexture.minFilter = THREE.NearestFilter;
        newTexture.wrapS = THREE.RepeatWrapping;
        newTexture.wrapT = THREE.RepeatWrapping;
        this.tilesHorizontal = def.cols;
        this.tilesVertical = def.rows;
        newTexture.repeat.set(1 / this.tilesHorizontal, 1 / this.tilesVertical);
        newTexture.offset.set(0, 1 - 1 / this.tilesVertical);

        // Update sprite material
        if (this.sprite.material instanceof THREE.SpriteMaterial) {
          (this.sprite.material as THREE.SpriteMaterial).map = newTexture;
        }

        this.currentAnimationState = stateName;
        this.currentFrame = 0;
        this.frameCounter = 0;
      }
    }

    const def = Player3D.spriteDefinitions.get(stateName);
    if (def && this.sprite.material instanceof THREE.SpriteMaterial) {
      // Update animation frame using UV offset
      this.frameCounter++;
      if (this.frameCounter >= 60 / this.frameRate) {
        this.currentFrame = (this.currentFrame + 1) % def.count;
        this.frameCounter = 0;
      }

      const texture = (this.sprite.material as THREE.SpriteMaterial).map as THREE.Texture;
      if (texture) {
        const col = this.currentFrame % this.tilesHorizontal;
        const row = Math.floor(this.currentFrame / this.tilesHorizontal);

        texture.offset.x = col / this.tilesHorizontal;
        texture.offset.y = (this.tilesVertical - 1 - row) / this.tilesVertical;
      }
    }
  }

  update() {
    if (!this.sprite) return;

    // Smooth position interpolation for 3D coordinates
    this.sprite.position.x = lerp(this.sprite.position.x, this.x, 0.09);
    this.sprite.position.z = lerp(this.sprite.position.z, this.y, 0.09); // Convert y to z for 3D
    this.sprite.position.y = 50; // Fixed height above ground plane

    // Update nick text position
    if (this.nickText) {
      this.nickText.position.x = this.sprite.position.x;
      this.nickText.position.z = this.sprite.position.z;
      this.nickText.position.y = this.sprite.position.y + 50; // Above player
    }

    // Update animation
    this.updateAnimation();

    // Handle direction flip based on 3D coordinates
    if (this.targetX > this.sprite.position.x && this.sprite.scale.x < 0) {
      this.sprite.scale.x = this.scaleFactor;
    }

    if (this.targetX < this.sprite.position.x && this.sprite.scale.x > 0) {
      this.sprite.scale.x = -this.scaleFactor;
    }
  }

  onStateUpdatedFromServer() {
    if (this.getVelocity() > 10) this.setState(PlayerState.Run);
    if (this.getVelocity() < 10) this.setState(PlayerState.Idle);
    this.updateDirection();
  }

  updateDirection() {
    if (this.targetX > this.sprite.position.x && this.sprite.scale.x < this.scaleFactor) {
      this.sprite.scale.x = this.scaleFactor;
    }

    if (this.targetX < this.sprite.position.x && this.sprite.scale.x > -this.scaleFactor) {
      this.sprite.scale.x = -this.scaleFactor;
    }
  }

  setState(playerState: PlayerState) {
    if (this.fsm.currentState !== playerState) this.fsm.go(playerState);
  }

  destroy() {
    try {
      if (this.sprite) {
        // Three.js sprites don't have removeFromParent method, use scene.remove
        if (this.sprite.parent) {
          this.sprite.parent.remove(this.sprite);
        }
        if (this.sprite.material) {
          this.sprite.material.dispose();
        }
        this.sprite = undefined as any;
      }
    } catch (error) {
      console.warn('Error destroying sprite:', error);
    }

    try {
      if (this.nickText) {
        if (this.nickText.parent) {
          this.nickText.parent.remove(this.nickText);
        }
        if (this.nickText.material) {
          this.nickText.material.dispose();
        }
        this.nickText = undefined as any;
      }
    } catch (error) {
      console.warn('Error destroying nickText:', error);
    }
  }
}
