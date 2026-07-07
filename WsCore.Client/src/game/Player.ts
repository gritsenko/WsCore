import { IPlayer } from '../network/WsClient';

/**
 * Pure player STATE (no rendering, no THREE imports). Lives in WsClient.players
 * for the whole session — in the lobby it simply has no visual. The 3D visual is
 * a separate PlayerView owned by the GameScene, which reads this state each frame.
 */
export default class Player implements IPlayer {
  id: number;
  x = 0;
  y = 0;
  ax = 0;
  ay = 0;
  targetX = 0;
  targetY = 0;
  angle = 0;
  controls = 0;
  name = 'bot';
  speed: { x: number; y: number } = { x: 0, y: 0 };

  animationState = 0;
  hp = 0;
  maxHp = 100;
  body = 0;
  weapon = 0;
  armor = 0;
  isMyPlayer = false;

  /** Bumped on every name change so a PlayerView can lazily rebuild its label. */
  nameVersion = 0;

  constructor(id: number) {
    this.id = id;
  }

  updateName(name: string): void {
    this.name = name;
    this.nameVersion++;
  }

  getVelocity(): number {
    return Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y);
  }

  /** State object holds no resources; the view derives intent from the fields. */
  onStateUpdatedFromServer(): void {}

  destroy(): void {}
}
