import type { MapObjectData } from './protocol/MapObjectData';
import type { RoomUsersUpdateEvent } from './protocol/RoomUsersUpdateEvent';
import type { Room } from './rooms/Room';
import type { PositionBuffer } from '../utils/SnapshotInterpolation';
import type { ChatEntry, ChatLogChange } from './ChatLog';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** The player shape WsClient maintains; the game's `Player` implements it. */
export interface IPlayer {
  id: number;
  /** Latest replicated server position (not what is drawn — see `motion`). */
  x: number;
  y: number;
  /** Timestamped server positions for snapshot interpolation. */
  motion: PositionBuffer;
  name: string;
  /** 0 idle, 1 walk, 2 dead (server `Player.AnimationState`). */
  animationState: number;
  hp: number;
  maxHp: number;
  body: number;
  weapon: number;
  armor: number;
  isMyPlayer: boolean;

  updateName(name: string): void;
  onStateUpdatedFromServer(): void;
  destroy(): void;
}

/**
 * The single source of truth for app-level client events: name → listener signature.
 * `WsConnection.on()` and the protected `emitter` are both typed from this map, so a
 * wrong event name or listener signature is a compile error at every call site.
 *
 * `T` is the concrete player type (`WsClient<Player>` in the app).
 */
export type ClientEvents<T extends IPlayer = IPlayer> = {
  /** Transport status changes (emitted by WsConnection). */
  connectionStatus: (status: ConnectionStatus) => void;
  /** A fresh server session started (first connect or reconnect) — re-join rooms. */
  sessionInit: () => void;
  /** A player object was created from server state. */
  playerCreate: (player: T) => void;
  /** A player was removed (left, or session reset). */
  playerRemove: (player: T) => void;
  /** A player joined (PlayerJoinedEvent). Also fires after `playerCreate` for new ones. */
  playerJoined: (player: T) => void;
  playerName: (id: number, name: string) => void;
  roomUsers: (msg: RoomUsersUpdateEvent) => void;
  /** The server's room list arrived (RoomListEvent); `rooms` is in server order. */
  roomList: (rooms: Room[]) => void;
  /**
   * The server confirmed we are now in `roomId` (JoinRoomResultEvent success) — also
   * fired for the server's automatic lobby join on connect. Membership, the spatial
   * mode and (on leaving a spatial room) the player set are already updated.
   */
  roomJoined: (roomId: string) => void;
  /** The server refused a join; our room membership is unchanged. */
  roomJoinFailed: (roomId: string, error: string) => void;
  mapObjects: (objects: (MapObjectData | null)[] | null) => void;
  /** A live chat message was added to `roomId`'s log (our current room). */
  chat: (roomId: string, entry: ChatEntry) => void;
  /** `roomId`'s chat log changed through history (reset / catch-up / older page). */
  chatHistory: (roomId: string, change: ChatLogChange) => void;
  /** The member list (WsClient.presence) or our own user id changed. */
  presence: () => void;
};

/** PresenceUserInfo.status on the wire (server `PresenceStatus`). */
export enum PresenceStatus {
  Offline = 0,
  Online = 1,
  Away = 2,
}

/** A known user in the member list. */
export interface PresenceUser {
  userId: number;
  name: string;
  status: PresenceStatus;
  /** The room the user is in; null while offline. */
  roomId: string | null;
  /** Unix ms the user was last connected. */
  lastSeenMs: number;
}
