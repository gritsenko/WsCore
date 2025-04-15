import WriteBuffer from "./WriteBuffer.js";
import ReadBuffer from "./ReadBuffer.js";
//MessageType enum builder
var ServerEventType;
(function (ServerEventType) {
    ServerEventType[ServerEventType["GameStateUpdateEvent"] = 0] = "GameStateUpdateEvent";
    ServerEventType[ServerEventType["GameTickUpdateEvent"] = 1] = "GameTickUpdateEvent";
    ServerEventType[ServerEventType["PlayerJoinedEvent"] = 2] = "PlayerJoinedEvent";
    ServerEventType[ServerEventType["PlayerLeftEvent"] = 3] = "PlayerLeftEvent";
    ServerEventType[ServerEventType["PlayerRespawnEvent"] = 4] = "PlayerRespawnEvent";
    ServerEventType[ServerEventType["SetPlayerHpEvent"] = 5] = "SetPlayerHpEvent";
    ServerEventType[ServerEventType["PlayersTopEvent"] = 6] = "PlayersTopEvent";
    ServerEventType[ServerEventType["UpdateMapObjectsEvent"] = 52] = "UpdateMapObjectsEvent";
    ServerEventType[ServerEventType["SetPlayerNameEvent"] = 100] = "SetPlayerNameEvent";
    ServerEventType[ServerEventType["UpdatePlayerSlotsEvent"] = 102] = "UpdatePlayerSlotsEvent";
    ServerEventType[ServerEventType["PlayerShootingEvent"] = 103] = "PlayerShootingEvent";
    ServerEventType[ServerEventType["ChatMessageEvent"] = 200] = "ChatMessageEvent";
    ServerEventType[ServerEventType["InitPlayerEvent"] = 255] = "InitPlayerEvent";
})(ServerEventType || (ServerEventType = {}));
;
var ClientMessageType;
(function (ClientMessageType) {
    ClientMessageType[ClientMessageType["GetTilesRequest"] = 50] = "GetTilesRequest";
    ClientMessageType[ClientMessageType["GetMapObjectsRequest"] = 51] = "GetMapObjectsRequest";
    ClientMessageType[ClientMessageType["SetMapObjectRequest"] = 52] = "SetMapObjectRequest";
    ClientMessageType[ClientMessageType["DestroyMapObjectRequest"] = 53] = "DestroyMapObjectRequest";
    ClientMessageType[ClientMessageType["SetPlayerNameRequest"] = 100] = "SetPlayerNameRequest";
    ClientMessageType[ClientMessageType["UpdatePlayerStateRequest"] = 101] = "UpdatePlayerStateRequest";
    ClientMessageType[ClientMessageType["UpdatePlayerSlotsRequest"] = 102] = "UpdatePlayerSlotsRequest";
    ClientMessageType[ClientMessageType["PlayerShootingRequest"] = 103] = "PlayerShootingRequest";
    ClientMessageType[ClientMessageType["PlayerRespawnRequest"] = 105] = "PlayerRespawnRequest";
    ClientMessageType[ClientMessageType["UpdatePlayerTargetRequest"] = 106] = "UpdatePlayerTargetRequest";
    ClientMessageType[ClientMessageType["ChatMessageRequest"] = 200] = "ChatMessageRequest";
})(ClientMessageType || (ClientMessageType = {}));
;
//Data definitions
var PlayerStateData = /** @class */ (function () {
    function PlayerStateData() {
    }
    return PlayerStateData;
}());
export { PlayerStateData };
var MapObjectData = /** @class */ (function () {
    function MapObjectData() {
    }
    return MapObjectData;
}());
export { MapObjectData };
var HitPlayerStateData = /** @class */ (function () {
    function HitPlayerStateData() {
    }
    return HitPlayerStateData;
}());
export { HitPlayerStateData };
var MovementStateData = /** @class */ (function () {
    function MovementStateData() {
    }
    return MovementStateData;
}());
export { MovementStateData };
var DestroyedBulletsStateData = /** @class */ (function () {
    function DestroyedBulletsStateData() {
    }
    return DestroyedBulletsStateData;
}());
export { DestroyedBulletsStateData };
//Server events definitions
var InitPlayerEvent = /** @class */ (function () {
    function InitPlayerEvent() {
    }
    return InitPlayerEvent;
}());
export { InitPlayerEvent };
var PlayerJoinedEvent = /** @class */ (function () {
    function PlayerJoinedEvent() {
    }
    return PlayerJoinedEvent;
}());
export { PlayerJoinedEvent };
var PlayerLeftEvent = /** @class */ (function () {
    function PlayerLeftEvent() {
    }
    return PlayerLeftEvent;
}());
export { PlayerLeftEvent };
var PlayerRespawnEvent = /** @class */ (function () {
    function PlayerRespawnEvent() {
    }
    return PlayerRespawnEvent;
}());
export { PlayerRespawnEvent };
var PlayerShootingEvent = /** @class */ (function () {
    function PlayerShootingEvent() {
    }
    return PlayerShootingEvent;
}());
export { PlayerShootingEvent };
var PlayersTopEvent = /** @class */ (function () {
    function PlayersTopEvent() {
    }
    return PlayersTopEvent;
}());
export { PlayersTopEvent };
var SetPlayerHpEvent = /** @class */ (function () {
    function SetPlayerHpEvent() {
    }
    return SetPlayerHpEvent;
}());
export { SetPlayerHpEvent };
var SetPlayerNameEvent = /** @class */ (function () {
    function SetPlayerNameEvent() {
    }
    return SetPlayerNameEvent;
}());
export { SetPlayerNameEvent };
var UpdatePlayerSlotsEvent = /** @class */ (function () {
    function UpdatePlayerSlotsEvent() {
    }
    return UpdatePlayerSlotsEvent;
}());
export { UpdatePlayerSlotsEvent };
var UpdateMapObjectsEvent = /** @class */ (function () {
    function UpdateMapObjectsEvent() {
    }
    return UpdateMapObjectsEvent;
}());
export { UpdateMapObjectsEvent };
var GameStateUpdateEvent = /** @class */ (function () {
    function GameStateUpdateEvent() {
    }
    return GameStateUpdateEvent;
}());
export { GameStateUpdateEvent };
var GameTickUpdateEvent = /** @class */ (function () {
    function GameTickUpdateEvent() {
    }
    return GameTickUpdateEvent;
}());
export { GameTickUpdateEvent };
var ChatMessageEvent = /** @class */ (function () {
    function ChatMessageEvent() {
    }
    return ChatMessageEvent;
}());
export { ChatMessageEvent };
//Client requests
var PlayerRespawnRequest = /** @class */ (function () {
    function PlayerRespawnRequest() {
    }
    return PlayerRespawnRequest;
}());
export { PlayerRespawnRequest };
var PlayerShootingRequest = /** @class */ (function () {
    function PlayerShootingRequest() {
    }
    return PlayerShootingRequest;
}());
export { PlayerShootingRequest };
var SetPlayerNameRequest = /** @class */ (function () {
    function SetPlayerNameRequest() {
    }
    return SetPlayerNameRequest;
}());
export { SetPlayerNameRequest };
var UpdatePlayerSlotsRequest = /** @class */ (function () {
    function UpdatePlayerSlotsRequest() {
    }
    return UpdatePlayerSlotsRequest;
}());
export { UpdatePlayerSlotsRequest };
var UpdatePlayerStateRequest = /** @class */ (function () {
    function UpdatePlayerStateRequest() {
    }
    return UpdatePlayerStateRequest;
}());
export { UpdatePlayerStateRequest };
var UpdatePlayerTargetRequest = /** @class */ (function () {
    function UpdatePlayerTargetRequest() {
    }
    return UpdatePlayerTargetRequest;
}());
export { UpdatePlayerTargetRequest };
var DestroyMapObjectRequest = /** @class */ (function () {
    function DestroyMapObjectRequest() {
    }
    return DestroyMapObjectRequest;
}());
export { DestroyMapObjectRequest };
var GetMapObjectsRequest = /** @class */ (function () {
    function GetMapObjectsRequest() {
    }
    return GetMapObjectsRequest;
}());
export { GetMapObjectsRequest };
var GetTilesRequest = /** @class */ (function () {
    function GetTilesRequest() {
    }
    return GetTilesRequest;
}());
export { GetTilesRequest };
var SetMapObjectRequest = /** @class */ (function () {
    function SetMapObjectRequest() {
    }
    return SetMapObjectRequest;
}());
export { SetMapObjectRequest };
var ChatMessageRequest = /** @class */ (function () {
    function ChatMessageRequest() {
    }
    return ChatMessageRequest;
}());
export { ChatMessageRequest };
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
    Wsc.prototype.readInitPlayerEvent = function (buff) {
        var obj = new InitPlayerEvent();
        return obj;
    };
    Wsc.prototype.readPlayerJoinedEvent = function (buff) {
        var obj = new PlayerJoinedEvent();
        obj.PlayerStateData = this.readPlayerStateData(buff);
        return obj;
    };
    Wsc.prototype.readPlayerLeftEvent = function (buff) {
        var obj = new PlayerLeftEvent();
        obj.ClientId = buff.popUInt32();
        return obj;
    };
    Wsc.prototype.readPlayerRespawnEvent = function (buff) {
        var obj = new PlayerRespawnEvent();
        obj.PlayerStateData = this.readPlayerStateData(buff);
        return obj;
    };
    Wsc.prototype.readPlayerShootingEvent = function (buff) {
        var obj = new PlayerShootingEvent();
        obj.ClientId = buff.popUInt32();
        obj.Weapon = buff.popInt32();
        obj.BulletIds = this.readArray(buff, function (b) { return b.popUInt32(); });
        return obj;
    };
    Wsc.prototype.readPlayersTopEvent = function (buff) {
        var obj = new PlayersTopEvent();
        obj.PlayersTop = buff.popStringFixedLength(1024);
        return obj;
    };
    Wsc.prototype.readSetPlayerHpEvent = function (buff) {
        var obj = new SetPlayerHpEvent();
        obj.PlayerId = buff.popUInt32();
        obj.PlayerHp = buff.popUInt8();
        return obj;
    };
    Wsc.prototype.readSetPlayerNameEvent = function (buff) {
        var obj = new SetPlayerNameEvent();
        obj.ClientId = buff.popUInt32();
        obj.Name = buff.popStringFixedLength(32);
        return obj;
    };
    Wsc.prototype.readUpdatePlayerSlotsEvent = function (buff) {
        var obj = new UpdatePlayerSlotsEvent();
        obj.PlayerId = buff.popUInt32();
        obj.Body = buff.popInt32();
        obj.Gun = buff.popInt32();
        obj.Armor = buff.popInt32();
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
    Wsc.prototype.readMapObjectData = function (buff) {
        var obj = new MapObjectData();
        obj.ObjectId = buff.popUInt32();
        obj.X = buff.popFloat();
        obj.Y = buff.popFloat();
        obj.ObjectType = buff.popUInt32();
        return obj;
    };
    Wsc.prototype.readUpdateMapObjectsEvent = function (buff) {
        var _this = this;
        var obj = new UpdateMapObjectsEvent();
        obj.MapObjects = this.readArray(buff, function (b) { return _this.readMapObjectData(b); });
        return obj;
    };
    Wsc.prototype.readGameStateUpdateEvent = function (buff) {
        var _this = this;
        var obj = new GameStateUpdateEvent();
        obj.PlayerStateData = this.readArray(buff, function (b) { return _this.readPlayerStateData(b); });
        return obj;
    };
    Wsc.prototype.readGameTickUpdateEvent = function (buff) {
        var _this = this;
        var obj = new GameTickUpdateEvent();
        obj.MovementStates = this.readArray(buff, function (b) { return _this.readMovementStateData(b); });
        obj.DestroyedBulletsIds = this.readArray(buff, function (b) { return b.popUInt32(); });
        obj.RespawnedPlayerIds = this.readArray(buff, function (b) { return b.popUInt32(); });
        obj.HitPlayersState = this.readArray(buff, function (b) { return _this.readHitPlayerStateData(b); });
        return obj;
    };
    Wsc.prototype.readHitPlayerStateData = function (buff) {
        var obj = new HitPlayerStateData();
        obj.PlayerId = buff.popUInt32();
        obj.HitterId = buff.popUInt32();
        obj.NewHp = buff.popInt32();
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
    Wsc.prototype.readChatMessageEvent = function (buff) {
        var obj = new ChatMessageEvent();
        obj.ClientId = buff.popUInt32();
        obj.Message = buff.popStringFixedLength(256);
        return obj;
    };
    Wsc.prototype.readDestroyedBulletsStateData = function (buff) {
        var obj = new DestroyedBulletsStateData();
        obj.BulletIds = this.readArray(buff, function (b) { return b.popUInt32(); });
        return obj;
    };
    //Message readers
    Wsc.prototype.onInitPlayerEvent = function (msg) {
    };
    Wsc.prototype.onPlayerJoinedEvent = function (msg) {
    };
    Wsc.prototype.onPlayerLeftEvent = function (msg) {
    };
    Wsc.prototype.onPlayerRespawnEvent = function (msg) {
    };
    Wsc.prototype.onPlayerShootingEvent = function (msg) {
    };
    Wsc.prototype.onPlayersTopEvent = function (msg) {
    };
    Wsc.prototype.onSetPlayerHpEvent = function (msg) {
    };
    Wsc.prototype.onSetPlayerNameEvent = function (msg) {
    };
    Wsc.prototype.onUpdatePlayerSlotsEvent = function (msg) {
    };
    Wsc.prototype.onUpdateMapObjectsEvent = function (msg) {
    };
    Wsc.prototype.onGameStateUpdateEvent = function (msg) {
    };
    Wsc.prototype.onGameTickUpdateEvent = function (msg) {
    };
    Wsc.prototype.onChatMessageEvent = function (msg) {
    };
    Wsc.prototype.processServerMessage = function (buff) {
        var _this = this;
        //getting server message type
        var serverMessageType = buff.popUInt8();
        switch (serverMessageType) {
            case ServerEventType.InitPlayerEvent:
                var initPlayerEvent = new InitPlayerEvent();
                this.onInitPlayerEvent(initPlayerEvent);
                break;
            case ServerEventType.PlayerJoinedEvent:
                var playerJoinedEvent = new PlayerJoinedEvent();
                playerJoinedEvent.PlayerStateData = this.readPlayerStateData(buff);
                this.onPlayerJoinedEvent(playerJoinedEvent);
                break;
            case ServerEventType.PlayerLeftEvent:
                var playerLeftEvent = new PlayerLeftEvent();
                playerLeftEvent.ClientId = buff.popUInt32();
                this.onPlayerLeftEvent(playerLeftEvent);
                break;
            case ServerEventType.PlayerRespawnEvent:
                var playerRespawnEvent = new PlayerRespawnEvent();
                playerRespawnEvent.PlayerStateData = this.readPlayerStateData(buff);
                this.onPlayerRespawnEvent(playerRespawnEvent);
                break;
            case ServerEventType.PlayerShootingEvent:
                var playerShootingEvent = new PlayerShootingEvent();
                playerShootingEvent.ClientId = buff.popUInt32();
                playerShootingEvent.Weapon = buff.popInt32();
                playerShootingEvent.BulletIds = this.readArray(buff, function (b) { return b.popUInt32(); });
                this.onPlayerShootingEvent(playerShootingEvent);
                break;
            case ServerEventType.PlayersTopEvent:
                var playersTopEvent = new PlayersTopEvent();
                playersTopEvent.PlayersTop = buff.popStringFixedLength(1024);
                this.onPlayersTopEvent(playersTopEvent);
                break;
            case ServerEventType.SetPlayerHpEvent:
                var setPlayerHpEvent = new SetPlayerHpEvent();
                setPlayerHpEvent.PlayerId = buff.popUInt32();
                setPlayerHpEvent.PlayerHp = buff.popUInt8();
                this.onSetPlayerHpEvent(setPlayerHpEvent);
                break;
            case ServerEventType.SetPlayerNameEvent:
                var setPlayerNameEvent = new SetPlayerNameEvent();
                setPlayerNameEvent.ClientId = buff.popUInt32();
                setPlayerNameEvent.Name = buff.popStringFixedLength(32);
                this.onSetPlayerNameEvent(setPlayerNameEvent);
                break;
            case ServerEventType.UpdatePlayerSlotsEvent:
                var updatePlayerSlotsEvent = new UpdatePlayerSlotsEvent();
                updatePlayerSlotsEvent.PlayerId = buff.popUInt32();
                updatePlayerSlotsEvent.Body = buff.popInt32();
                updatePlayerSlotsEvent.Gun = buff.popInt32();
                updatePlayerSlotsEvent.Armor = buff.popInt32();
                this.onUpdatePlayerSlotsEvent(updatePlayerSlotsEvent);
                break;
            case ServerEventType.UpdateMapObjectsEvent:
                var updateMapObjectsEvent = new UpdateMapObjectsEvent();
                updateMapObjectsEvent.MapObjects = this.readArray(buff, function (b) { return _this.readMapObjectData(b); });
                this.onUpdateMapObjectsEvent(updateMapObjectsEvent);
                break;
            case ServerEventType.GameStateUpdateEvent:
                var gameStateUpdateEvent = new GameStateUpdateEvent();
                gameStateUpdateEvent.PlayerStateData = this.readArray(buff, function (b) { return _this.readPlayerStateData(b); });
                this.onGameStateUpdateEvent(gameStateUpdateEvent);
                break;
            case ServerEventType.GameTickUpdateEvent:
                var gameTickUpdateEvent = new GameTickUpdateEvent();
                gameTickUpdateEvent.MovementStates = this.readArray(buff, function (b) { return _this.readMovementStateData(b); });
                gameTickUpdateEvent.DestroyedBulletsIds = this.readArray(buff, function (b) { return b.popUInt32(); });
                gameTickUpdateEvent.RespawnedPlayerIds = this.readArray(buff, function (b) { return b.popUInt32(); });
                gameTickUpdateEvent.HitPlayersState = this.readArray(buff, function (b) { return _this.readHitPlayerStateData(b); });
                this.onGameTickUpdateEvent(gameTickUpdateEvent);
                break;
            case ServerEventType.ChatMessageEvent:
                var chatMessageEvent = new ChatMessageEvent();
                chatMessageEvent.ClientId = buff.popUInt32();
                chatMessageEvent.Message = buff.popStringFixedLength(256);
                this.onChatMessageEvent(chatMessageEvent);
                break;
        }
    };
    //Message senders
    Wsc.prototype.sendPlayerRespawnRequest = function (PlayerId) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerRespawnRequest)
            .pushUInt32(PlayerId)
            .send(this.ws);
    };
    Wsc.prototype.sendPlayerShootingRequest = function (Weapon) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerShootingRequest)
            .pushInt32(Weapon)
            .send(this.ws);
    };
    Wsc.prototype.sendSetPlayerNameRequest = function (Name) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetPlayerNameRequest)
            .pushString(Name, 32)
            .send(this.ws);
    };
    Wsc.prototype.sendUpdatePlayerSlotsRequest = function (Body, Gun, Armor) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerSlotsRequest)
            .pushInt32(Body)
            .pushInt32(Gun)
            .pushInt32(Armor)
            .send(this.ws);
    };
    Wsc.prototype.sendUpdatePlayerStateRequest = function (AimX, AimY, ControlsState) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerStateRequest)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .pushInt32(ControlsState)
            .send(this.ws);
    };
    Wsc.prototype.sendUpdatePlayerTargetRequest = function (AimX, AimY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerTargetRequest)
            .pushFloat(AimX)
            .pushFloat(AimY)
            .send(this.ws);
    };
    Wsc.prototype.sendDestroyMapObjectRequest = function (MapX, MapY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.DestroyMapObjectRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    };
    Wsc.prototype.sendGetMapObjectsRequest = function (MapX, MapY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetMapObjectsRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    };
    Wsc.prototype.sendGetTilesRequest = function (MapX, MapY) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetTilesRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .send(this.ws);
    };
    Wsc.prototype.sendSetMapObjectRequest = function (MapX, MapY, ObjectType) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetMapObjectRequest)
            .pushInt32(MapX)
            .pushInt32(MapY)
            .pushInt32(ObjectType)
            .send(this.ws);
    };
    Wsc.prototype.sendChatMessageRequest = function (Message) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.ChatMessageRequest)
            .pushString(Message, 256)
            .send(this.ws);
    };
    return Wsc;
}());
export default Wsc;
//# sourceMappingURL=WsConnection.js.map