import { IPlayer } from '../network/WsClient';
import { MotionState, PositionBuffer } from '../utils/SnapshotInterpolation';

/**
 * Pure player STATE (no rendering, no THREE imports). Lives in WsClient.players while
 * we are in the game world. The 3D visual is a separate PlayerView owned by the
 * GameScene, which calls updateRender() and reads the render fields each frame.
 */
export default class Player implements IPlayer {
  id: number;
  /** Latest replicated server position. */
  x = 0;
  y = 0;
  /** Server positions with server timestamps, for snapshot interpolation. */
  readonly motion = new PositionBuffer();

  /** Interpolated position/velocity (units/s) to draw this frame (see updateRender). */
  renderX = 0;
  renderY = 0;
  speed: { x: number; y: number } = { x: 0, y: 0 };

  /**
   * Local input state, owned by the client (only meaningful for our own player): the
   * WASD bitmask and aim point sent with UpdatePlayerStateRequest. The server no longer
   * echoes them back in snapshots.
   */
  ax = 0;
  ay = 0;
  controls = 0;

  name = 'bot';
  animationState = 0;
  hp = 0;
  maxHp = 100;
  body = 0;
  weapon = 0;
  armor = 0;
  isMyPlayer = false;

  /** Bumped on every name change so a PlayerView can lazily rebuild its label. */
  nameVersion = 0;

  private readonly sampled: MotionState = { x: 0, y: 0, vx: 0, vy: 0 };

  constructor(id: number) {
    this.id = id;
  }

  updateName(name: string): void {
    this.name = name;
    this.nameVersion++;
  }

  /**
   * Sample the interpolation buffer at server time `renderT` into renderX/renderY/speed.
   * Velocity comes from the interpolated segment, so it drops to zero once the stopped
   * state has been replicated.
   */
  updateRender(renderT: number): void {
    const m = this.sampled;
    if (this.motion.sample(renderT, m)) {
      this.renderX = m.x;
      this.renderY = m.y;
      this.speed.x = m.vx;
      this.speed.y = m.vy;
    } else {
      this.renderX = this.x;
      this.renderY = this.y;
      this.speed.x = this.speed.y = 0;
    }
  }

  getVelocity(): number {
    return Math.sqrt(this.speed.x * this.speed.x + this.speed.y * this.speed.y);
  }

  /** State object holds no resources; the view derives intent from the fields. */
  onStateUpdatedFromServer(): void {}

  destroy(): void {}
}
