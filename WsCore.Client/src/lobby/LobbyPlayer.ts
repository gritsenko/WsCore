import { IPlayer } from '../network/WsClient';

/**
 * Minimal player implementation for lobby mode (no rendering)
 */
export default class LobbyPlayer implements IPlayer {
  id: number;
  x = 0;
  y = 0;
  ax = 0;
  ay = 0;
  targetX = 0;
  targetY = 0;
  angle = 0;
  controls = 0;
  name: string = '';
  speed: any = { x: 0, y: 0 };
  animationState: number = 0;
  hp = 0;
  maxHp = 100;
  body = 0;
  weapon = 0;
  armor = 0;
  isMyPlayer: boolean = false;

  constructor(id: number) {
    this.id = id;
  }

  updateName(name: string): void {
    this.name = name;
  }

  onStateUpdatedFromServer(): void {
    // No-op for lobby mode - we don't render players
  }

  destroy(): void {
    // No-op for lobby mode
  }
}
