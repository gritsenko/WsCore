import WriteBuffer from "./WriteBuffer.js";
import ReadBuffer from "./ReadBuffer.js";
//MessageType enum builder
var ServerMessageType;
(function (ServerMessageType) {
    ServerMessageType[ServerMessageType["GameState"] = 0] = "GameState";
    ServerMessageType[ServerMessageType["GameTickState"] = 1] = "GameTickState";
    ServerMessageType[ServerMessageType["PlayerJoined"] = 2] = "PlayerJoined";
    ServerMessageType[ServerMessageType["PlayerLeft"] = 3] = "PlayerLeft";
    ServerMessageType[ServerMessageType["RespawnPlayer"] = 4] = "RespawnPlayer";
    ServerMessageType[ServerMessageType["PlayerSetHp"] = 5] = "PlayerSetHp";
    ServerMessageType[ServerMessageType["PlayersTop"] = 6] = "PlayersTop";
    ServerMessageType[ServerMessageType["MapTiles"] = 51] = "MapTiles";
    ServerMessageType[ServerMessageType["MapObjects"] = 52] = "MapObjects";
    ServerMessageType[ServerMessageType["SetPlayerName"] = 100] = "SetPlayerName";
    ServerMessageType[ServerMessageType["UpdatePlayerSlots"] = 102] = "UpdatePlayerSlots";
    ServerMessageType[ServerMessageType["PlayerShooting"] = 103] = "PlayerShooting";
    ServerMessageType[ServerMessageType["ChatMessage"] = 200] = "ChatMessage";
    ServerMessageType[ServerMessageType["InitPlayer"] = 255] = "InitPlayer";
})(ServerMessageType || (ServerMessageType = {}));
;
var ClientMessageType;
(function (ClientMessageType) {
    ClientMessageType[ClientMessageType["GetTiles"] = 50] = "GetTiles";
    ClientMessageType[ClientMessageType["GetMapObjects"] = 51] = "GetMapObjects";
    ClientMessageType[ClientMessageType["SetMapObject"] = 52] = "SetMapObject";
    ClientMessageType[ClientMessageType["DestroyMapObject"] = 53] = "DestroyMapObject";
    ClientMessageType[ClientMessageType["SetPlayerName"] = 100] = "SetPlayerName";
    ClientMessageType[ClientMessageType["UpdatePlayerState"] = 101] = "UpdatePlayerState";
    ClientMessageType[ClientMessageType["UpdatePlayerSlots"] = 102] = "UpdatePlayerSlots";
    ClientMessageType[ClientMessageType["PlayerShooting"] = 103] = "PlayerShooting";
    ClientMessageType[ClientMessageType["HitPlayer"] = 104] = "HitPlayer";
    ClientMessageType[ClientMessageType["RespawnPlayer"] = 105] = "RespawnPlayer";
    ClientMessageType[ClientMessageType["UpdatePlayerTarget"] = 106] = "UpdatePlayerTarget";
    ClientMessageType[ClientMessageType["ChatMessage"] = 200] = "ChatMessage";
})(ClientMessageType || (ClientMessageType = {}));
;
//Data definitions
var DestroyedBulletsStateData = /** @class */ (function () {
    function DestroyedBulletsStateData() {
    }
    return DestroyedBulletsStateData;
}());
export { DestroyedBulletsStateData };
var MapObjectData = /** @class */ (function () {
    function MapObjectData() {
    }
    return MapObjectData;
}());
export { MapObjectData };
var MovementStateData = /** @class */ (function () {
    function MovementStateData() {
    }
    return MovementStateData;
}());
export { MovementStateData };
var PlayerStateData = /** @class */ (function () {
    function PlayerStateData() {
    }
    return PlayerStateData;
}());
export { PlayerStateData };
var ChatServerMessage = /** @class */ (function () {
    function ChatServerMessage() {
    }
    return ChatServerMessage;
}());
export { ChatServerMessage };
var GameStateServerMessage = /** @class */ (function () {
    function GameStateServerMessage() {
    }
    return GameStateServerMessage;
}());
export { GameStateServerMessage };
var GameTickStateServerMessage = /** @class */ (function () {
    function GameTickStateServerMessage() {
    }
    return GameTickStateServerMessage;
}());
export { GameTickStateServerMessage };
var InitPlayerServerMessage = /** @class */ (function () {
    function InitPlayerServerMessage() {
    }
    return InitPlayerServerMessage;
}());
export { InitPlayerServerMessage };
var MapObjectsServerMessage = /** @class */ (function () {
    function MapObjectsServerMessage() {
    }
    return MapObjectsServerMessage;
}());
export { MapObjectsServerMessage };
var PlayerJoinedServerMessage = /** @class */ (function () {
    function PlayerJoinedServerMessage() {
    }
    return PlayerJoinedServerMessage;
}());
export { PlayerJoinedServerMessage };
var PlayerLeftServerMessage = /** @class */ (function () {
    function PlayerLeftServerMessage() {
    }
    return PlayerLeftServerMessage;
}());
export { PlayerLeftServerMessage };
var PlayerRespawnServerMessage = /** @class */ (function () {
    function PlayerRespawnServerMessage() {
    }
    return PlayerRespawnServerMessage;
}());
export { PlayerRespawnServerMessage };
var PlayerShootingServerMessage = /** @class */ (function () {
    function PlayerShootingServerMessage() {
    }
    return PlayerShootingServerMessage;
}());
export { PlayerShootingServerMessage };
var PlayersTopServerMessage = /** @class */ (function () {
    function PlayersTopServerMessage() {
    }
    return PlayersTopServerMessage;
}());
export { PlayersTopServerMessage };
var SetPlayerHpServerMessage = /** @class */ (function () {
    function SetPlayerHpServerMessage() {
    }
    return SetPlayerHpServerMessage;
}());
export { SetPlayerHpServerMessage };
var SetPlayerNameServerMessage = /** @class */ (function () {
    function SetPlayerNameServerMessage() {
    }
    return SetPlayerNameServerMessage;
}());
export { SetPlayerNameServerMessage };
var UpdatePlayerSlotsServerMessage = /** @class */ (function () {
    function UpdatePlayerSlotsServerMessage() {
    }
    return UpdatePlayerSlotsServerMessage;
}());
export { UpdatePlayerSlotsServerMessage };
var ChatClientMessage = /** @class */ (function () {
    function ChatClientMessage() {
    }
    return ChatClientMessage;
}());
export { ChatClientMessage };
var GetMapObjectsClientMessage = /** @class */ (function () {
    function GetMapObjectsClientMessage() {
    }
    return GetMapObjectsClientMessage;
}());
export { GetMapObjectsClientMessage };
var GetTilesClientMessage = /** @class */ (function () {
    function GetTilesClientMessage() {
    }
    return GetTilesClientMessage;
}());
export { GetTilesClientMessage };
var PlayerHitClientMessage = /** @class */ (function () {
    function PlayerHitClientMessage() {
    }
    return PlayerHitClientMessage;
}());
export { PlayerHitClientMessage };
var PlayerRespawnClientMessage = /** @class */ (function () {
    function PlayerRespawnClientMessage() {
    }
    return PlayerRespawnClientMessage;
}());
export { PlayerRespawnClientMessage };
var PlayerShootingClientMessage = /** @class */ (function () {
    function PlayerShootingClientMessage() {
    }
    return PlayerShootingClientMessage;
}());
export { PlayerShootingClientMessage };
var SetMapObjectClientMessage = /** @class */ (function () {
    function SetMapObjectClientMessage() {
    }
    return SetMapObjectClientMessage;
}());
export { SetMapObjectClientMessage };
var DestroyMapObjectClientMessage = /** @class */ (function () {
    function DestroyMapObjectClientMessage() {
    }
    return DestroyMapObjectClientMessage;
}());
export { DestroyMapObjectClientMessage };
var SetPlayerNameClientMessage = /** @class */ (function () {
    function SetPlayerNameClientMessage() {
    }
    return SetPlayerNameClientMessage;
}());
export { SetPlayerNameClientMessage };
var UpdatePlayerSlotsClientMessage = /** @class */ (function () {
    function UpdatePlayerSlotsClientMessage() {
    }
    return UpdatePlayerSlotsClientMessage;
}());
export { UpdatePlayerSlotsClientMessage };
var UpdatePlayerStateClientMessage = /** @class */ (function () {
    function UpdatePlayerStateClientMessage() {
    }
    return UpdatePlayerStateClientMessage;
}());
export { UpdatePlayerStateClientMessage };
var UpdatePlayerTargetClientMessage = /** @class */ (function () {
    function UpdatePlayerTargetClientMessage() {
    }
    return UpdatePlayerTargetClientMessage;
}());
export { UpdatePlayerTargetClientMessage };
var Wsc = /** @class */ (function () {
    function Wsc() {
        this.clientId = -1;
        this.writeBuff = new WriteBuffer();
        this.readBuff = new ReadBuffer();
    }
    Wsc.prototype.connect = function (overrideUrl) {
        var _this = this;
        this.overrideUrl = overrideUrl;
        this.ws = this.createSocket();
        this.ws.onmessage = function (e) { return _this.processServerMessage(new ReadBuffer().setInput(e.data)); };
    };
    Wsc.prototype.createSocket = function () {
        var scheme = document.location.protocol == "https:" ? "wss" : "ws";
        var port = document.location.port ? (":" + document.location.port) : "";
        this.serverUrl = scheme + "://" + document.location.hostname + port + "/ws";
        this.ws = new WebSocket(this.overrideUrl == undefined ? this.serverUrl : this.overrideUrl);
        this.ws.binaryType = "arraybuffer";
        return this.ws;
    };
    //Array reader
    Wsc.prototype.readArray = function (buff, itemReader) {
        var itemsCount = buff.popUInt32();
        var items = [];
        for (var i = 0; i < itemsCount; i++) {
            items.push(itemReader(buff));
        }
        return items;
    };
    //Data readers
    Wsc.prototype.readDestroyedBulletsStateData = function (buff) {
        var obj = new DestroyedBulletsStateData();
        obj.BulletIds = this.readArray(buff, function (b) { return b.popUInt32(); });
        return obj;
    };
    Wsc.prototype.readMapObjectData = function (buff) {
        var obj = new MapObjectData();
        obj.ObjectId = buff.popUInt32();
        obj.X = buff.popFloat();
        obj.Y = buff.popFloat();
        obj.ObjectType = buff.popUInt32();
        return obj;
    };
    Wsc.prototype.readMovementStateData = function (buff) {
        var obj = new MovementStateData();
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
    };
    Wsc.prototype.readPlayerStateData = function (buff) {
        var obj = new PlayerStateData();
        obj.Id = buff.popUInt32();
        obj.Name = buff.popStringFixedLength(32);
        obj.Hp = buff.popUInt8();
        obj.MaxHp = buff.popUInt8();
        obj.BodyIndex = buff.popInt32();
        obj.WeaponIndex = buff.popInt32();
        obj.ArmorIndex = buff.popInt32();
        obj.MovementState = this.readMovementStateData(buff);
        return obj;
    };
    //Message readers
    Wsc.prototype.onChatMessage = function (msg) {
    };
    Wsc.prototype.onGameState = function (msg) {
    };
    Wsc.prototype.onGameTickState = function (msg) {
    };
    Wsc.prototype.onInitPlayer = function (msg) {
    };
    Wsc.prototype.onMapObjects = function (msg) {
    };
    Wsc.prototype.onPlayerJoined = function (msg) {
    };
    Wsc.prototype.onPlayerLeft = function (msg) {
    };
    Wsc.prototype.onRespawnPlayer = function (msg) {
    };
    Wsc.prototype.onPlayerShooting = function (msg) {
    };
    Wsc.prototype.onPlayersTop = function (msg) {
    };
    Wsc.prototype.onPlayerSetHp = function (msg) {
    };
    Wsc.prototype.onSetPlayerName = function (msg) {
    };
    Wsc.prototype.onUpdatePlayerSlots = function (msg) {
    };
    Wsc.prototype.processServerMessage = function (buff) {
        var _this = this;
        //getting server message type
        var serverMessageType = buff.popUInt8();
        switch (serverMessageType) {
            case ServerMessageType.ChatMessage:
                var ChatMessageMessage = new ChatServerMessage();
                ChatMessageMessage.ClientId = buff.popUInt32();
                ChatMessageMessage.Message = buff.popStringFixedLength(256);
                this.onChatMessage(ChatMessageMessage);
                break;
            case ServerMessageType.GameState:
                var GameStateMessage = new GameStateServerMessage();
                GameStateMessage.PlayerStateData = this.readArray(buff, function (b) { return _this.readPlayerStateData(b); });
                this.onGameState(GameStateMessage);
                break;
            case ServerMessageType.GameTickState:
                var GameTickStateMessage = new GameTickStateServerMessage();
                GameTickStateMessage.MovementStates = this.readArray(buff, function (b) { return _this.readMovementStateData(b); });
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
                MapObjectsMessage.MapObjects = this.readArray(buff, function (b) { return _this.readMapObjectData(b); });
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
    };
    //Message senders
    Wsc.prototype.sendChatMessage = function (Message) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.ChatMessage)
            .pushString(Message, 256)
            .send(this.ws);
    };
    Wsc.prototype.sendGetMapObjects = function (MapX, MapY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetMapObjects)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    };
    Wsc.prototype.sendGetTiles = function (MapX, MapY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetTiles)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    };
    Wsc.prototype.sendHitPlayer = function (PlayeId, HitPoints) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.HitPlayer)
            .pushUInt32(PlayeId)
            .pushInt32(HitPoints)
            .send(this.ws);
    };
    Wsc.prototype.sendRespawnPlayer = function (PlayerId) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.RespawnPlayer)
            .pushUInt32(PlayerId)
            .send(this.ws);
    };
    Wsc.prototype.sendPlayerShooting = function (Weapon) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerShooting)
            .pushInt32(Weapon)
            .send(this.ws);
    };
    Wsc.prototype.sendSetMapObject = function (MapX, MapY, ObjectType) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetMapObject)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .pushInt32(ObjectType)
            .send(this.ws);
    };
    Wsc.prototype.sendDestroyMapObject = function (MapX, MapY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.DestroyMapObject)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    };
    Wsc.prototype.sendSetPlayerName = function (Name) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetPlayerName)
            .pushString(Name, 32)
            .send(this.ws);
    };
    Wsc.prototype.sendUpdatePlayerSlots = function (Body, Gun, Armor) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerSlots)
            .pushInt32(Body)
            .pushInt32(Gun)
            .pushInt32(Armor)
            .send(this.ws);
    };
    Wsc.prototype.sendUpdatePlayerState = function (AimX, AimY, ControlsState) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerState)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .pushInt32(ControlsState)
            .send(this.ws);
    };
    Wsc.prototype.sendUpdatePlayerTarget = function (AimX, AimY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerTarget)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .send(this.ws);
    };
    return Wsc;
}());
export default Wsc;
//# sourceMappingURL=WsConnection.js.map