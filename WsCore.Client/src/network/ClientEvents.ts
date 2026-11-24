import type { MapObjectData } from './protocol/MapObjectData';
import type { RoomUsersUpdateEvent } from './protocol/RoomUsersUpdateEvent';
import type { Room } from './rooms/Room';
import type { PositionBuffer } from '../utils/SnapshotInterpolation';
import type { ChatEntry, ChatLogChange } from './ChatLog';
import type { ModerationResult } from './Permissions';

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
  /** The server answered an account request (claim / login / logout / profile / avatar). */
  account: (result: AccountResult) => void;
  /** A message was deleted from `roomId`'s log (it was cached; the UI should drop it). */
  chatDeleted: (roomId: string, messageId: number) => void;
  /** Channel roles / permissions changed (WsClient.permissions). */
  permissions: () => void;
  /** The server answered a moderation request, or refused a chat message of ours. */
  moderation: (result: ModerationResult) => void;
  /**
   * The server's Web Push key arrived (after every identify): (re)register this
   * browser's subscription, if notifications are on (see ChatAlerts).
   */
  pushConfig: (publicKey: string) => void;
  /** The server answered our identify / login with the member list (we have a user id). */
  identified: () => void;
  /** Who is in which voice channel changed (WsClient.voiceRoster). */
  voiceRoster: () => void;
  /** The games portal's catalog changed (WsClient.games). */
  games: () => void;
  /** The server answered an API-token request (our tokens, a new one once, or a refusal). */
  apiTokens: (result: ApiTokensResult) => void;
  /** We are in voice in `roomId`: call `peers` (client ids already there) with these ICE servers. */
  voiceJoined: (roomId: string, peers: number[], iceServers: VoiceIceServerConfig[]) => void;
  /** The server refused our voice join (server `VoiceError` code). */
  voiceJoinFailed: (roomId: string, error: string) => void;
  /** We are out of voice: we left, or the server took us out (`moved`, `removed`). */
  voiceLeft: (roomId: string, reason: string) => void;
  /** A WebRTC signal from another participant of our voice channel. */
  voiceSignal: (fromClientId: number, kind: VoiceSignalKind, data: string) => void;
};

/** VoiceSignalRequest/Event.kind on the wire (server `VoiceSignalKind`). */
export enum VoiceSignalKind {
  Offer = 1,
  Answer = 2,
  Candidate = 3,
}

/** An ICE server as RTCPeerConnection takes it. */
export interface VoiceIceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

/** Someone in a voice channel. */
export interface VoiceParticipant {
  clientId: number;
  userId: number;
  muted: boolean;
  deafened: boolean;
}

/** AccountResultEvent.action on the wire (server `AccountAction`). */
export enum AccountAction {
  Claim = 1,
  Login = 2,
  Logout = 3,
  Profile = 4,
  Avatar = 5,
}

export interface AccountResult {
  action: AccountAction;
  success: boolean;
  /** Server `AccountError` code ("login_taken", "bad_credentials"…); null on success. */
  error: string | null;
}

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
  /** "About me" text ('' if not set). */
  about: string;
  /** 0 = no avatar; otherwise part of the image URL (see WsClient.avatarUrl). */
  avatarVersion: number;
  /** The login of a claimed account (public, shown as @login); null for a guest. */
  login: string | null;
  /** A server admin: every right in every channel. */
  isAdmin: boolean;
}

/** A game of the games portal (GameInfo on the wire). */
export interface PortalGame {
  id: string;
  /** The page is /games/{slug}. */
  slug: string;
  title: string;
  tagline: string;
  /** Markdown. */
  description: string;
  tags: string[];
  /** False = a draft: only its owner and server admins see it. */
  isPublic: boolean;
  /** The (hidden) text room the game is played in. */
  roomId: string;
  ownerUserId: number;
  /** 0 = no build yet. */
  releaseNo: number;
  version: string;
  /** The build's entry on the games origin; empty without a build. */
  playUrl: string;
  createdMs: number;
  updatedMs: number;
  /** Plays so far (sessions past the threshold; the game's own people excluded). */
  plays: number;
}

/** One of our API tokens (the token itself is never shown again after creation). */
export interface ApiToken {
  id: string;
  name: string;
  createdMs: number;
  /** 0 = never used. */
  lastUsedMs: number;
}

export interface ApiTokensResult {
  tokens: ApiToken[];
  /** The token just created — shown once; empty otherwise. */
  newToken: string;
  /** "forbidden" / "limit" / "not_found"; empty on success. */
  error: string;
}
