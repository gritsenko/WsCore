import WriteBuffer from "./WriteBuffer.js"
import ReadBuffer from "./ReadBuffer.js"
//MessageType enum builder
enum ServerMessageType {
    GameState = 0,
    GameTickState = 1,
    PlayerJoined = 2,
    PlayerLeft = 3,
    RespawnPlayer = 4,
    PlayerSetHp = 5,
    PlayersTop = 6,
    MapTiles = 51,
    MapObjects = 52,
    SetPlayerName = 100,
    UpdatePlayerSlots = 102,
    PlayerShooting = 103,
    ChatMessage = 200,
    InitPlayer = 255
};
enum ClientMessageType {
    GetTiles = 50,
    GetMapObjects = 51,
    SetMapObject = 52,
    DestroyMapObject = 53,
    SetPlayerName = 100,
    UpdatePlayerState = 101,
    UpdatePlayerSlots = 102,
    PlayerShooting = 103,
    HitPlayer = 104,
    RespawnPlayer = 105,
    UpdatePlayerTarget = 106,
    ChatMessage = 200
};
//Data definitions
export class DestroyedBulletsStateData {
    BulletIds: number[];
}
export class MapObjectData {
    ObjectId: number;
    X: number;
    Y: number;
    ObjectType: number;
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
export class ChatServerMessage {
    ClientId: number;
    Message: string;
}
export class GameStateServerMessage {
    PlayerStateData: PlayerStateData[];
}
export class GameTickStateServerMessage {
    MovementStates: MovementStateData[];
    DestroyedBulletsState: DestroyedBulletsStateData;
}
export class InitPlayerServerMessage {
    ClientId: number;
}
export class MapObjectsServerMessage {
    MapObjects: MapObjectData[];
}
export class PlayerJoinedServerMessage {
    PlayerStateData: PlayerStateData;
}
export class PlayerLeftServerMessage {
    ClientId: number;
}
export class PlayerRespawnServerMessage {
    PlayerStateData: PlayerStateData;
}
export class PlayerShootingServerMessage {
    ClientId: number;
    Weapon: number;
}
export class PlayersTopServerMessage {
    PlayersTop: string;
}
export class SetPlayerHpServerMessage {
    PlayerId: number;
    PlayerHp: number;
}
export class SetPlayerNameServerMessage {
    ClientId: number;
    Name: string;
}
export class UpdatePlayerSlotsServerMessage {
    PlayerId: number;
    Body: number;
    Gun: number;
    Armor: number;
}
export class ChatClientMessage {
    Message: string;
}
export class GetMapObjectsClientMessage {
    MapX: number;
    MapY: number;
}
export class GetTilesClientMessage {
    MapX: number;
    MapY: number;
}
export class PlayerHitClientMessage {
    PlayeId: number;
    HitPoints: number;
}
export class PlayerRespawnClientMessage {
    PlayerId: number;
}
export class PlayerShootingClientMessage {
    Weapon: number;
}
export class SetMapObjectClientMessage {
    MapX: number;
    MapY: number;
    ObjectType: number;
}
export class DestroyMapObjectClientMessage {
    MapX: number;
    MapY: number;
}
export class SetPlayerNameClientMessage {
    Name: string;
}
export class UpdatePlayerSlotsClientMessage {
    Body: number;
    Gun: number;
    Armor: number;
}
export class UpdatePlayerStateClientMessage {
    AimX: number;
    AimY: number;
    ControlsState: number;
}
export class UpdatePlayerTargetClientMessage {
    AimX: number;
    AimY: number;
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
    readDestroyedBulletsStateData(buff) {
        const obj = new DestroyedBulletsStateData();
        obj.BulletIds = this.readArray(buff, b => { return b.popUInt32(); });
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
    //Message readers
    onChatMessage(msg: ChatServerMessage) {
    }
    onGameState(msg: GameStateServerMessage) {
    }
    onGameTickState(msg: GameTickStateServerMessage) {
    }
    onInitPlayer(msg: InitPlayerServerMessage) {
    }
    onMapObjects(msg: MapObjectsServerMessage) {
    }
    onPlayerJoined(msg: PlayerJoinedServerMessage) {
    }
    onPlayerLeft(msg: PlayerLeftServerMessage) {
    }
    onRespawnPlayer(msg: PlayerRespawnServerMessage) {
    }
    onPlayerShooting(msg: PlayerShootingServerMessage) {
    }
    onPlayersTop(msg: PlayersTopServerMessage) {
    }
    onPlayerSetHp(msg: SetPlayerHpServerMessage) {
    }
    onSetPlayerName(msg: SetPlayerNameServerMessage) {
    }
    onUpdatePlayerSlots(msg: UpdatePlayerSlotsServerMessage) {
    }
    processServerMessage(buff) {
        //getting server message type
        const serverMessageType = buff.popUInt8();
        switch (serverMessageType) {
            case ServerMessageType.ChatMessage:
                var ChatMessageMessage = new ChatServerMessage();
                ChatMessageMessage.ClientId = buff.popUInt32();
                ChatMessageMessage.Message = buff.popStringFixedLength(256);
                this.onChatMessage(ChatMessageMessage);
                break;
            case ServerMessageType.GameState:
                var GameStateMessage = new GameStateServerMessage();
                GameStateMessage.PlayerStateData = this.readArray(buff, b => { return this.readPlayerStateData(b); });
                this.onGameState(GameStateMessage);
                break;
            case ServerMessageType.GameTickState:
                var GameTickStateMessage = new GameTickStateServerMessage();
                GameTickStateMessage.MovementStates = this.readArray(buff, b => { return this.readMovementStateData(b); });
                GameTickStateMessage.DestroyedBulletsState = this.readDestroyedBulletsStateData(buff);
                this.onGameTickState(GameTickStateMessage);
                break;
            case ServerMessageType.InitPlayer:
                var InitPlayerMessage = new InitPlayerServerMessage();
                InitPlayerMessage.ClientId = buff.popUInt32();
                this.onInitPlayer(InitPlayerMessage);
                break;
            case ServerMessageType.MapObjects:
                var MapObjectsMessage = new MapObjectsServerMessage();
                MapObjectsMessage.MapObjects = this.readArray(buff, b => { return this.readMapObjectData(b); });
                this.onMapObjects(MapObjectsMessage);
                break;
            case ServerMessageType.PlayerJoined:
                var PlayerJoinedMessage = new PlayerJoinedServerMessage();
                PlayerJoinedMessage.PlayerStateData = this.readPlayerStateData(buff);
                this.onPlayerJoined(PlayerJoinedMessage);
                break;
            case ServerMessageType.PlayerLeft:
                var PlayerLeftMessage = new PlayerLeftServerMessage();
                PlayerLeftMessage.ClientId = buff.popUInt32();
                this.onPlayerLeft(PlayerLeftMessage);
                break;
            case ServerMessageType.RespawnPlayer:
                var RespawnPlayerMessage = new PlayerRespawnServerMessage();
                RespawnPlayerMessage.PlayerStateData = this.readPlayerStateData(buff);
                this.onRespawnPlayer(RespawnPlayerMessage);
                break;
            case ServerMessageType.PlayerShooting:
                var PlayerShootingMessage = new PlayerShootingServerMessage();
                PlayerShootingMessage.ClientId = buff.popUInt32();
                PlayerShootingMessage.Weapon = buff.popInt32();
                this.onPlayerShooting(PlayerShootingMessage);
                break;
            case ServerMessageType.PlayersTop:
                var PlayersTopMessage = new PlayersTopServerMessage();
                PlayersTopMessage.PlayersTop = buff.popStringFixedLength(1024);
                this.onPlayersTop(PlayersTopMessage);
                break;
            case ServerMessageType.PlayerSetHp:
                var PlayerSetHpMessage = new SetPlayerHpServerMessage();
                PlayerSetHpMessage.PlayerId = buff.popUInt32();
                PlayerSetHpMessage.PlayerHp = buff.popUInt8();
                this.onPlayerSetHp(PlayerSetHpMessage);
                break;
            case ServerMessageType.SetPlayerName:
                var SetPlayerNameMessage = new SetPlayerNameServerMessage();
                SetPlayerNameMessage.ClientId = buff.popUInt32();
                SetPlayerNameMessage.Name = buff.popStringFixedLength(32);
                this.onSetPlayerName(SetPlayerNameMessage);
                break;
            case ServerMessageType.UpdatePlayerSlots:
                var UpdatePlayerSlotsMessage = new UpdatePlayerSlotsServerMessage();
                UpdatePlayerSlotsMessage.PlayerId = buff.popUInt32();
                UpdatePlayerSlotsMessage.Body = buff.popInt32();
                UpdatePlayerSlotsMessage.Gun = buff.popInt32();
                UpdatePlayerSlotsMessage.Armor = buff.popInt32();
                this.onUpdatePlayerSlots(UpdatePlayerSlotsMessage);
                break;
        }
    }
    //Message senders
    sendChatMessage(Message: string) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.ChatMessage)
            .pushString(Message, 256)
            .send(this.ws);
    }
    sendGetMapObjects(MapX: number, MapY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetMapObjects)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    }
    sendGetTiles(MapX: number, MapY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetTiles)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    }
    sendHitPlayer(PlayeId: number, HitPoints: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.HitPlayer)
            .pushUInt32(PlayeId)
            .pushInt32(HitPoints)
            .send(this.ws);
    }
    sendRespawnPlayer(PlayerId: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.RespawnPlayer)
            .pushUInt32(PlayerId)
            .send(this.ws);
    }
    sendPlayerShooting(Weapon: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerShooting)
            .pushInt32(Weapon)
            .send(this.ws);
    }
    sendSetMapObject(MapX: number, MapY: number, ObjectType: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetMapObject)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .pushInt32(ObjectType)
            .send(this.ws);
    }
    sendDestroyMapObject(MapX: number, MapY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.DestroyMapObject)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    }
    sendSetPlayerName(Name: string) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetPlayerName)
            .pushString(Name, 32)
            .send(this.ws);
    }
    sendUpdatePlayerSlots(Body: number, Gun: number, Armor: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerSlots)
            .pushInt32(Body)
            .pushInt32(Gun)
            .pushInt32(Armor)
            .send(this.ws);
    }
    sendUpdatePlayerState(AimX: number, AimY: number, ControlsState: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerState)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .pushInt32(ControlsState)
            .send(this.ws);
    }
    sendUpdatePlayerTarget(AimX: number, AimY: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerTarget)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .send(this.ws);
    }
}
