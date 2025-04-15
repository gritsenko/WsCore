import WriteBuffer from "./WriteBuffer.js"
import ReadBuffer from "./ReadBuffer.js"
//MessageType enum builder
enum ServerEventType {
    GameStateUpdateEvent = 0,
    GameTickUpdateEvent = 1,
    PlayerJoinedEvent = 2,
    PlayerLeftEvent = 3,
    PlayerRespawnEvent = 4,
    SetPlayerHpEvent = 5,
    PlayersTopEvent = 6,
    UpdateMapObjectsEvent = 52,
    SetPlayerNameEvent = 100,
    UpdatePlayerSlotsEvent = 102,
    PlayerShootingEvent = 103,
    ChatMessageEvent = 200,
    InitPlayerEvent = 255
};
enum ClientMessageType {
    GetTilesRequest = 50,
    GetMapObjectsRequest = 51,
    SetMapObjectRequest = 52,
    DestroyMapObjectRequest = 53,
    SetPlayerNameRequest = 100,
    UpdatePlayerStateRequest = 101,
    UpdatePlayerSlotsRequest = 102,
    PlayerShootingRequest = 103,
    PlayerRespawnRequest = 105,
    UpdatePlayerTargetRequest = 106,
    ChatMessageRequest = 200
};
//Data definitions
export class PlayerStateData {
    Id: number;
    Name: string;
    Hp: number;
    MaxHp: number;
    BodyIndex: number;
    WeaponIndex: number;
    ArmorIndex: number;
    MovementState: MovementStateData;
}
export class MapObjectData {
    ObjectId: number;
    X: number;
    Y: number;
    ObjectType: number;
}
export class HitPlayerStateData {
    PlayerId: number;
    HitterId: number;
    NewHp: number;
}
export class MovementStateData {
    PlayerId: number;
    X: number;
    Y: number;
    AimX: number;
    AimY: number;
    TargetX: number;
    TargetY: number;
    BodyAngle: number;
    ControlsState: number;
    VelocityX: number;
    VelocityY: number;
    AnimationState: number;
}
export class DestroyedBulletsStateData {
    BulletIds: number[];
}
//Server events definitions
export class InitPlayerEvent {
}
export class PlayerJoinedEvent {
    PlayerStateData: PlayerStateData;
}
export class PlayerLeftEvent {
    ClientId: number;
}
export class PlayerRespawnEvent {
    PlayerStateData: PlayerStateData;
}
export class PlayerShootingEvent {
    ClientId: number;
    Weapon: number;
    BulletIds: number[];
}
export class PlayersTopEvent {
    PlayersTop: string;
}
export class SetPlayerHpEvent {
    PlayerId: number;
    PlayerHp: number;
}
export class SetPlayerNameEvent {
    ClientId: number;
    Name: string;
}
export class UpdatePlayerSlotsEvent {
    PlayerId: number;
    Body: number;
    Gun: number;
    Armor: number;
}
export class UpdateMapObjectsEvent {
    MapObjects: MapObjectData[];
}
export class GameStateUpdateEvent {
    PlayerStateData: PlayerStateData[];
}
export class GameTickUpdateEvent {
    MovementStates: MovementStateData[];
    DestroyedBulletsIds: number[];
    RespawnedPlayerIds: number[];
    HitPlayersState: HitPlayerStateData[];
}
export class ChatMessageEvent {
    ClientId: number;
    Message: string;
}
//Client requests
export class PlayerRespawnRequest {
    PlayerId: number;
}
export class PlayerShootingRequest {
    Weapon: number;
}
export class SetPlayerNameRequest {
    Name: string;
}
export class UpdatePlayerSlotsRequest {
    Body: number;
    Gun: number;
    Armor: number;
}
export class UpdatePlayerStateRequest {
    AimX: number;
    AimY: number;
    ControlsState: number;
}
export class UpdatePlayerTargetRequest {
    AimX: number;
    AimY: number;
}
export class DestroyMapObjectRequest {
    MapX: number;
    MapY: number;
}
export class GetMapObjectsRequest {
    MapX: number;
    MapY: number;
}
export class GetTilesRequest {
    MapX: number;
    MapY: number;
}
export class SetMapObjectRequest {
    MapX: number;
    MapY: number;
    ObjectType: number;
}
export class ChatMessageRequest {
    Message: string;
}
export default class Wsc {

    clientId = -1;
    writeBuff = new WriteBuffer();
    readBuff = new ReadBuffer();
    ws: WebSocket;
    overrideUrl: string;
    serverUrl: string;
    constructor() {
    }

    connect(overrideUrl) {
        this.overrideUrl = overrideUrl;
        this.ws = this.createSocket();
        this.ws.onmessage = e => this.processServerMessage(new ReadBuffer().setInput(e.data));
    }
    createSocket() {
        const scheme = document.location.protocol == "https:" ? "wss" : "ws";
        const port = document.location.port ? (":" + document.location.port) : "";
        this.serverUrl = scheme + "://" + document.location.hostname + port + "/ws";

        this.ws = new WebSocket(this.overrideUrl == undefined ? this.serverUrl : this.overrideUrl);
        this.ws.binaryType = "arraybuffer";
        return this.ws;
    }
    //Array reader
    readArray(buff, itemReader) {
        var itemsCount = buff.popUInt32();
        var items = [];
        for (let i = 0; i < itemsCount; i++) {
            items.push(itemReader(buff));
        }
        return items;
    }
    //Data readers
    readInitPlayerEvent(buff) {
        const obj = new InitPlayerEvent();
        return obj;
    }
    readPlayerJoinedEvent(buff) {
        const obj = new PlayerJoinedEvent();
        obj.PlayerStateData = this.readPlayerStateData(buff);
        return obj;
    }
    readPlayerLeftEvent(buff) {
        const obj = new PlayerLeftEvent();
        obj.ClientId = buff.popUInt32();
        return obj;
    }
    readPlayerRespawnEvent(buff) {
        const obj = new PlayerRespawnEvent();
        obj.PlayerStateData = this.readPlayerStateData(buff);
        return obj;
    }
    readPlayerShootingEvent(buff) {
        const obj = new PlayerShootingEvent();
        obj.ClientId = buff.popUInt32();
        obj.Weapon = buff.popInt32();
        obj.BulletIds = this.readArray(buff, b => { return b.popUInt32(); });
        return obj;
    }
    readPlayersTopEvent(buff) {
        const obj = new PlayersTopEvent();
        obj.PlayersTop = buff.popStringFixedLength(1024);
        return obj;
    }
    readSetPlayerHpEvent(buff) {
        const obj = new SetPlayerHpEvent();
        obj.PlayerId = buff.popUInt32();
        obj.PlayerHp = buff.popUInt8();
        return obj;
    }
    readSetPlayerNameEvent(buff) {
        const obj = new SetPlayerNameEvent();
        obj.ClientId = buff.popUInt32();
        obj.Name = buff.popStringFixedLength(32);
        return obj;
    }
    readUpdatePlayerSlotsEvent(buff) {
        const obj = new UpdatePlayerSlotsEvent();
        obj.PlayerId = buff.popUInt32();
        obj.Body = buff.popInt32();
        obj.Gun = buff.popInt32();
        obj.Armor = buff.popInt32();
        return obj;
    }
    readPlayerStateData(buff) {
        const obj = new PlayerStateData();
        obj.Id = buff.popUInt32();
        obj.Name = buff.popStringFixedLength(32);
        obj.Hp = buff.popUInt8();
        obj.MaxHp = buff.popUInt8();
        obj.BodyIndex = buff.popInt32();
        obj.WeaponIndex = buff.popInt32();
        obj.ArmorIndex = buff.popInt32();
        obj.MovementState = this.readMovementStateData(buff);
        return obj;
    }
    readMapObjectData(buff) {
        const obj = new MapObjectData();
        obj.ObjectId = buff.popUInt32();
        obj.X = buff.popFloat();
        obj.Y = buff.popFloat();
        obj.ObjectType = buff.popUInt32();
        return obj;
    }
    readUpdateMapObjectsEvent(buff) {
        const obj = new UpdateMapObjectsEvent();
        obj.MapObjects = this.readArray(buff, b => { return this.readMapObjectData(b); });
        return obj;
    }
    readGameStateUpdateEvent(buff) {
        const obj = new GameStateUpdateEvent();
        obj.PlayerStateData = this.readArray(buff, b => { return this.readPlayerStateData(b); });
        return obj;
    }
    readGameTickUpdateEvent(buff) {
        const obj = new GameTickUpdateEvent();
        obj.MovementStates = this.readArray(buff, b => { return this.readMovementStateData(b); });
        obj.DestroyedBulletsIds = this.readArray(buff, b => { return b.popUInt32(); });
        obj.RespawnedPlayerIds = this.readArray(buff, b => { return b.popUInt32(); });
        obj.HitPlayersState = this.readArray(buff, b => { return this.readHitPlayerStateData(b); });
        return obj;
    }
    readHitPlayerStateData(buff) {
        const obj = new HitPlayerStateData();
        obj.PlayerId = buff.popUInt32();
        obj.HitterId = buff.popUInt32();
        obj.NewHp = buff.popInt32();
        return obj;
    }
    readMovementStateData(buff) {
        const obj = new MovementStateData();
        obj.PlayerId = buff.popUInt32();
        obj.X = buff.popFloat();
        obj.Y = buff.popFloat();
        obj.AimX = buff.popFloat();
        obj.AimY = buff.popFloat();
        obj.TargetX = buff.popFloat();
        obj.TargetY = buff.popFloat();
        obj.BodyAngle = buff.popInt32();
        obj.ControlsState = buff.popInt32();
        obj.VelocityX = buff.popFloat();
        obj.VelocityY = buff.popFloat();
        obj.AnimationState = buff.popInt32();
        return obj;
    }
    readChatMessageEvent(buff) {
        const obj = new ChatMessageEvent();
        obj.ClientId = buff.popUInt32();
        obj.Message = buff.popStringFixedLength(256);
        return obj;
    }
    readDestroyedBulletsStateData(buff) {
        const obj = new DestroyedBulletsStateData();
        obj.BulletIds = this.readArray(buff, b => { return b.popUInt32(); });
        return obj;
    }
    //Message readers
    onInitPlayerEvent(msg: InitPlayerEvent) {
    }
    onPlayerJoinedEvent(msg: PlayerJoinedEvent) {
    }
    onPlayerLeftEvent(msg: PlayerLeftEvent) {
    }
    onPlayerRespawnEvent(msg: PlayerRespawnEvent) {
    }
    onPlayerShootingEvent(msg: PlayerShootingEvent) {
    }
    onPlayersTopEvent(msg: PlayersTopEvent) {
    }
    onSetPlayerHpEvent(msg: SetPlayerHpEvent) {
    }
    onSetPlayerNameEvent(msg: SetPlayerNameEvent) {
    }
    onUpdatePlayerSlotsEvent(msg: UpdatePlayerSlotsEvent) {
    }
    onUpdateMapObjectsEvent(msg: UpdateMapObjectsEvent) {
    }
    onGameStateUpdateEvent(msg: GameStateUpdateEvent) {
    }
    onGameTickUpdateEvent(msg: GameTickUpdateEvent) {
    }
    onChatMessageEvent(msg: ChatMessageEvent) {
    }
    processServerMessage(buff) {
        //getting server message type
        const serverMessageType = buff.popUInt8();
        switch (serverMessageType) {
            case ServerEventType.InitPlayerEvent:
                const initPlayerEvent = new InitPlayerEvent();
                this.onInitPlayerEvent(initPlayerEvent);
                break;
            case ServerEventType.PlayerJoinedEvent:
                const playerJoinedEvent = new PlayerJoinedEvent();
                playerJoinedEvent.PlayerStateData = this.readPlayerStateData(buff);
                this.onPlayerJoinedEvent(playerJoinedEvent);
                break;
            case ServerEventType.PlayerLeftEvent:
                const playerLeftEvent = new PlayerLeftEvent();
                playerLeftEvent.ClientId = buff.popUInt32();
                this.onPlayerLeftEvent(playerLeftEvent);
                break;
            case ServerEventType.PlayerRespawnEvent:
                const playerRespawnEvent = new PlayerRespawnEvent();
                playerRespawnEvent.PlayerStateData = this.readPlayerStateData(buff);
                this.onPlayerRespawnEvent(playerRespawnEvent);
                break;
            case ServerEventType.PlayerShootingEvent:
                const playerShootingEvent = new PlayerShootingEvent();
                playerShootingEvent.ClientId = buff.popUInt32();
                playerShootingEvent.Weapon = buff.popInt32();
                playerShootingEvent.BulletIds = this.readArray(buff, b => { return b.popUInt32(); });
                this.onPlayerShootingEvent(playerShootingEvent);
                break;
            case ServerEventType.PlayersTopEvent:
                const playersTopEvent = new PlayersTopEvent();
                playersTopEvent.PlayersTop = buff.popStringFixedLength(1024);
                this.onPlayersTopEvent(playersTopEvent);
                break;
            case ServerEventType.SetPlayerHpEvent:
                const setPlayerHpEvent = new SetPlayerHpEvent();
                setPlayerHpEvent.PlayerId = buff.popUInt32();
                setPlayerHpEvent.PlayerHp = buff.popUInt8();
                this.onSetPlayerHpEvent(setPlayerHpEvent);
                break;
            case ServerEventType.SetPlayerNameEvent:
                const setPlayerNameEvent = new SetPlayerNameEvent();
                setPlayerNameEvent.ClientId = buff.popUInt32();
                setPlayerNameEvent.Name = buff.popStringFixedLength(32);
                this.onSetPlayerNameEvent(setPlayerNameEvent);
                break;
            case ServerEventType.UpdatePlayerSlotsEvent:
                const updatePlayerSlotsEvent = new UpdatePlayerSlotsEvent();
                updatePlayerSlotsEvent.PlayerId = buff.popUInt32();
                updatePlayerSlotsEvent.Body = buff.popInt32();
                updatePlayerSlotsEvent.Gun = buff.popInt32();
                updatePlayerSlotsEvent.Armor = buff.popInt32();
                this.onUpdatePlayerSlotsEvent(updatePlayerSlotsEvent);
                break;
            case ServerEventType.UpdateMapObjectsEvent:
                const updateMapObjectsEvent = new UpdateMapObjectsEvent();
                updateMapObjectsEvent.MapObjects = this.readArray(buff, b => { return this.readMapObjectData(b); });
                this.onUpdateMapObjectsEvent(updateMapObjectsEvent);
                break;
            case ServerEventType.GameStateUpdateEvent:
                const gameStateUpdateEvent = new GameStateUpdateEvent();
                gameStateUpdateEvent.PlayerStateData = this.readArray(buff, b => { return this.readPlayerStateData(b); });
                this.onGameStateUpdateEvent(gameStateUpdateEvent);
                break;
            case ServerEventType.GameTickUpdateEvent:
                const gameTickUpdateEvent = new GameTickUpdateEvent();
                gameTickUpdateEvent.MovementStates = this.readArray(buff, b => { return this.readMovementStateData(b); });
                gameTickUpdateEvent.DestroyedBulletsIds = this.readArray(buff, b => { return b.popUInt32(); });
                gameTickUpdateEvent.RespawnedPlayerIds = this.readArray(buff, b => { return b.popUInt32(); });
                gameTickUpdateEvent.HitPlayersState = this.readArray(buff, b => { return this.readHitPlayerStateData(b); });
                this.onGameTickUpdateEvent(gameTickUpdateEvent);
                break;
            case ServerEventType.ChatMessageEvent:
                const chatMessageEvent = new ChatMessageEvent();
                chatMessageEvent.ClientId = buff.popUInt32();
                chatMessageEvent.Message = buff.popStringFixedLength(256);
                this.onChatMessageEvent(chatMessageEvent);
                break;
        }
    }
    //Message senders
    sendPlayerRespawnRequest(PlayerId: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerRespawnRequest)
            .pushUInt32(PlayerId)
            .send(this.ws);
    }
    sendPlayerShootingRequest(Weapon: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerShootingRequest)
            .pushInt32(Weapon)
            .send(this.ws);
    }
    sendSetPlayerNameRequest(Name: string) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetPlayerNameRequest)
            .pushString(Name, 32)
            .send(this.ws);
    }
    sendUpdatePlayerSlotsRequest(Body: number, Gun: number, Armor: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerSlotsRequest)
            .pushInt32(Body)
            .pushInt32(Gun)
            .pushInt32(Armor)
            .send(this.ws);
    }
    sendUpdatePlayerStateRequest(AimX: number, AimY: number, ControlsState: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerStateRequest)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .pushInt32(ControlsState)
            .send(this.ws);
    }
    sendUpdatePlayerTargetRequest(AimX: number, AimY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerTargetRequest)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .send(this.ws);
    }
    sendDestroyMapObjectRequest(MapX: number, MapY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.DestroyMapObjectRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    }
    sendGetMapObjectsRequest(MapX: number, MapY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetMapObjectsRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    }
    sendGetTilesRequest(MapX: number, MapY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetTilesRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    }
    sendSetMapObjectRequest(MapX: number, MapY: number, ObjectType: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetMapObjectRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .pushInt32(ObjectType)
            .send(this.ws);
    }
    sendChatMessageRequest(Message: string) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.ChatMessageRequest)
            .pushString(Message, 256)
            .send(this.ws);
    }
}
