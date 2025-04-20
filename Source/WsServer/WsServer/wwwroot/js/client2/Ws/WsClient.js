var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
import Player from "../Player.js";
import * as WsConnection from "./WsConnection.js";
var WsClient = /** @class */ (function (_super) {
    __extends(WsClient, _super);
    function WsClient() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.myPlayerName = "John Smith";
        _this.playersCount = 0;
        _this.players = [];
        return _this;
    }
    WsClient.prototype.onInitPlayerEvent = function (msg) {
        var _a;
        this.clientId = msg.ClientId;
        this.sendSetPlayerNameRequest(this.myPlayerName);
        this.sendUpdatePlayerSlotsRequest(0, 0, 0);
        (_a = this.onGameInitCallback) === null || _a === void 0 ? void 0 : _a.call(this);
    };
    WsClient.prototype.onSetPlayerNameEvent = function (msg) {
        if (this.players[msg.ClientId] != null) {
            this.players[msg.ClientId].updateName(msg.Name);
        }
    };
    WsClient.prototype.onChatMessageEvent = function (msg) {
        this.writeToChat(msg.ClientId, msg.Message);
    };
    WsClient.prototype.onPlayerJoinedEvent = function (msg) {
        this.updatePlayer(msg.PlayerStateData);
    };
    WsClient.prototype.onPlayerLeftEvent = function (msg) {
        this.removePlayer(msg.ClientId);
    };
    WsClient.prototype.onGameStateUpdateEvent = function (msg) {
        var playersCount = msg.PlayerStateData.length;
        for (var i = 0; i < playersCount; i++) {
            this.updatePlayer(msg.PlayerStateData[i]);
        }
    };
    WsClient.prototype.onGameTickUpdateEvent = function (msg) {
        var playersCount = msg.MovementStates.length;
        for (var i = 0; i < playersCount; i++) {
            var state = msg.MovementStates[i];
            var playerId = state.PlayerId;
            var p = this.players[playerId];
            if (p != undefined) {
                p.x = state.X;
                p.y = state.Y;
                p.ax = state.AimX;
                p.ay = state.AimY;
                p.targetX = state.TargetX;
                p.targetY = state.TargetY;
                p.angle = state.BodyAngle;
                p.controls = state.ControlsState;
                p.speed.x = state.VelocityX;
                p.speed.y = state.VelocityY;
                p.animationState = state.AnimationState;
                p.onStateUpdatedFromServer();
            }
        }
    };
    WsClient.prototype.onMapObjectsEvent = function (msg) {
        var _a;
        (_a = this.onMapObjectsCallback) === null || _a === void 0 ? void 0 : _a.call(this, msg.MapObjects);
    };
    WsClient.prototype.writeToChat = function (id, message) {
        console.log("Message to chat from client " + id + ": " + message);
    };
    WsClient.prototype.removePlayer = function (clientId) {
        var _a;
        var player = this.players[clientId];
        this.players.splice(this.players.indexOf(player), 1);
        (_a = this.onPlayerRemovedCallback) === null || _a === void 0 ? void 0 : _a.call(this, player);
        player.destroy();
    };
    WsClient.prototype.updatePlayer = function (playerData) {
        var player = null;
        var isNewPlayer = false;
        var playerId = playerData.Id;
        if (playerId in this.players) {
            player = this.players[playerId];
        }
        else {
            player = new Player(playerId);
            this.players[playerId] = player;
            isNewPlayer = true;
            this.playersCount++;
        }
        this.setPlayerData(player, playerData);
        if ((this.myPlayer == null || this.myPlayer == undefined) && player.id === this.clientId) {
            this.myPlayer = player;
        }
        if (isNewPlayer && this.onPlayerCreateCallback != null) {
            this.onPlayerCreateCallback(player);
        }
    };
    WsClient.prototype.setPlayerData = function (p, pd) {
        p.name = pd.Name.trim();
        p.hp = pd.Hp;
        p.maxHp = pd.MaxHp;
        p.body = pd.BodyIndex;
        p.weapon = pd.WeaponIndex;
        p.armor = pd.ArmorIndex;
        var ms = pd.MovementState;
        p.x = ms.X;
        p.y = ms.Y;
        p.ax = ms.AimX;
        p.ay = ms.AimY;
        p.angle = ms.BodyAngle;
        p.controls = ms.ControlsState;
        p.speed.x = ms.VelocityX;
        p.speed.y = ms.VelocityY;
    };
    WsClient.MapObjectData = WsConnection.MapObjectData;
    return WsClient;
}(WsConnection["default"]));
export default WsClient;
//# sourceMappingURL=WsClient.js.map