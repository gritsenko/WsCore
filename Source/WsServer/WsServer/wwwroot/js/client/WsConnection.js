//import buffer libs
import WriteBuffer from "./WriteBuffer.js";
import ReadBuffer from "./ReadBuffer.js";
//MessageType enum builder
var ServerMessageType = {
    GameState: 0,
    PlayersMovment: 1,
    PlayerJoined: 2,
    PlayerLeft: 3,
    RespawnPlayer: 4,
    PlayerSetHp: 5,
    PlayersTop: 6,
    MapTiles: 51,
    MapObjects: 52,
    SetPlayerName: 100,
    UpdatePlayerSlots: 102,
    PlayerShooting: 103,
    ChatMessage: 200,
    InitPlayer: 255
};
var ClientMessageType = {
    GetTiles: 50,
    GetMapObjects: 51,
    SetPlayerName: 100,
    UpdatePlayerState: 101,
    UpdatePlayerSlots: 102,
    PlayerShooting: 103,
    HitPlayer: 104,
    RespawnPlayer: 105,
    UpdatePlayerTarget: 106,
    ChatMessage: 200
};
export default class Wsc {
    constructor() {
        this.clientId = -1;
        this.writeBuff = new WriteBuffer();
        this.readBuff = new ReadBuffer();
    }

    connect(overrideUrl) {
        this.overrideUrl = overrideUrl;
        this.ws = this.createSocket();
        this.ws.onmessage = e => {
            this.processServerMessage(new ReadBuffer().setInput(e.data));
        }
    }
    createSocket() {
        const scheme = document.location.protocol == "https:" ? "wss" : "ws";
        const port = document.location.port ? (":" + document.location.port) : "";
        this.serverUrl = scheme + "://" + document.location.hostname + port + "/ws";

        this.socket = new WebSocket(this.overrideUrl == undefined ? this.serverUrl : this.overrideUrl);
        this.socket.binaryType = "arraybuffer";
        return this.socket;
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
    readMapObjectData(buff) {
        var obj = {};
        obj.ObjectId = buff.popUInt32();
        obj.X = buff.popFloat();
        obj.Y = buff.popFloat();
        obj.ObjectType = buff.popUInt32();
        return obj;
    }
    readMovmentStateData(buff) {
        var obj = {};
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
        var obj = {};
        obj.Id = buff.popUInt32();
        obj.Name = buff.popStringFixedLength(32);
        obj.Hp = buff.popUInt8();
        obj.MaxHp = buff.popUInt8();
        obj.BodyIndex = buff.popInt32();
        obj.WeaponIndex = buff.popInt32();
        obj.ArmorIndex = buff.popInt32();
        obj.MovmentState = this.readMovmentStateData(buff);
        return obj;
    }
    //Message readers
    onChatMessage(chatmessageMessage) {
    }
    onGameState(gamestateMessage) {
    }
    onInitPlayer(initplayerMessage) {
    }
    onMapObjects(mapobjectsMessage) {
    }
    onPlayerJoined(playerjoinedMessage) {
    }
    onPlayerLeft(playerleftMessage) {
    }
    onRespawnPlayer(respawnplayerMessage) {
    }
    onPlayerShooting(playershootingMessage) {
    }
    onPlayersMovment(playersmovmentMessage) {
    }
    onPlayersTop(playerstopMessage) {
    }
    onPlayerSetHp(playersethpMessage) {
    }
    onSetPlayerName(setplayernameMessage) {
    }
    onUpdatePlayerSlots(updateplayerslotsMessage) {
    }
    processServerMessage(buff) {
        //getting server message type
        const serverMessageType = buff.popUInt8();
        switch (serverMessageType) {
            case ServerMessageType.ChatMessage:
                var chatmessageMessage = { messaegeType: "ChatMessage" };
                chatmessageMessage.ClientId = buff.popUInt32();
                chatmessageMessage.Message = buff.popStringFixedLength(256);
                this.onChatMessage(chatmessageMessage);
                break;
            case ServerMessageType.GameState:
                var gamestateMessage = { messaegeType: "GameState" };
                gamestateMessage.PlayerStateData = this.readArray(buff, b => { return this.readPlayerStateData(b); });
                this.onGameState(gamestateMessage);
                break;
            case ServerMessageType.InitPlayer:
                var initplayerMessage = { messaegeType: "InitPlayer" };
                initplayerMessage.ClientId = buff.popUInt32();
                this.onInitPlayer(initplayerMessage);
                break;
            case ServerMessageType.MapObjects:
                var mapobjectsMessage = { messaegeType: "MapObjects" };
                mapobjectsMessage.MapObjects = this.readArray(buff, b => { return this.readMapObjectData(b); });
                this.onMapObjects(mapobjectsMessage);
                break;
            case ServerMessageType.PlayerJoined:
                var playerjoinedMessage = { messaegeType: "PlayerJoined" };
                playerjoinedMessage.PlayerStateData = this.readPlayerStateData(buff);
                this.onPlayerJoined(playerjoinedMessage);
                break;
            case ServerMessageType.PlayerLeft:
                var playerleftMessage = { messaegeType: "PlayerLeft" };
                playerleftMessage.ClientId = buff.popUInt32();
                this.onPlayerLeft(playerleftMessage);
                break;
            case ServerMessageType.RespawnPlayer:
                var respawnplayerMessage = { messaegeType: "RespawnPlayer" };
                respawnplayerMessage.PlayerStateData = this.readPlayerStateData(buff);
                this.onRespawnPlayer(respawnplayerMessage);
                break;
            case ServerMessageType.PlayerShooting:
                var playershootingMessage = { messaegeType: "PlayerShooting" };
                playershootingMessage.ClientId = buff.popUInt32();
                playershootingMessage.Weapon = buff.popInt32();
                this.onPlayerShooting(playershootingMessage);
                break;
            case ServerMessageType.PlayersMovment:
                var playersmovmentMessage = { messaegeType: "PlayersMovment" };
                playersmovmentMessage.MovmentStates = this.readArray(buff, b => { return this.readMovmentStateData(b); });
                this.onPlayersMovment(playersmovmentMessage);
                break;
            case ServerMessageType.PlayersTop:
                var playerstopMessage = { messaegeType: "PlayersTop" };
                playerstopMessage.PlayersTop = buff.popStringFixedLength(1024);
                this.onPlayersTop(playerstopMessage);
                break;
            case ServerMessageType.PlayerSetHp:
                var playersethpMessage = { messaegeType: "PlayerSetHp" };
                playersethpMessage.PlayerId = buff.popUInt32();
                playersethpMessage.PlayerHp = buff.popUInt8();
                this.onPlayerSetHp(playersethpMessage);
                break;
            case ServerMessageType.SetPlayerName:
                var setplayernameMessage = { messaegeType: "SetPlayerName" };
                setplayernameMessage.ClientId = buff.popUInt32();
                setplayernameMessage.Name = buff.popStringFixedLength(32);
                this.onSetPlayerName(setplayernameMessage);
                break;
            case ServerMessageType.UpdatePlayerSlots:
                var updateplayerslotsMessage = { messaegeType: "UpdatePlayerSlots" };
                updateplayerslotsMessage.PlayerId = buff.popUInt32();
                updateplayerslotsMessage.Body = buff.popInt32();
                updateplayerslotsMessage.Gun = buff.popInt32();
                updateplayerslotsMessage.Armor = buff.popInt32();
                this.onUpdatePlayerSlots(updateplayerslotsMessage);
                break;
        }
    }
    //Message senders
    sendChatMessage(message) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.ChatMessage)
            .pushString(message, 256)
            .send(this.ws);
    }
    sendGetMapObjects(mapx, mapy) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetMapObjects)
            .pushInt32(mapx)
            .pushInt32(mapy)
            .send(this.ws);
    }
    sendGetTiles(mapx, mapy) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetTiles)
            .pushInt32(mapx)
            .pushInt32(mapy)
            .send(this.ws);
    }
    sendHitPlayer(playeid, hitpoints) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.HitPlayer)
            .pushUInt32(playeid)
            .pushInt32(hitpoints)
            .send(this.ws);
    }
    sendRespawnPlayer(playerid) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.RespawnPlayer)
            .pushUInt32(playerid)
            .send(this.ws);
    }
    sendPlayerShooting(weapon) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerShooting)
            .pushInt32(weapon)
            .send(this.ws);
    }
    sendSetPlayerName(name) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetPlayerName)
            .pushString(name, 32)
            .send(this.ws);
    }
    sendUpdatePlayerSlots(body, gun, armor) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerSlots)
            .pushInt32(body)
            .pushInt32(gun)
            .pushInt32(armor)
            .send(this.ws);
    }
    sendUpdatePlayerState(aimx, aimy, controlsstate) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerState)
            .pushFloat(aimx)
            .pushFloat(aimy)
            .pushInt32(controlsstate)
            .send(this.ws);
    }
    sendUpdatePlayerTarget(aimx, aimy) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerTarget)
            .pushFloat(aimx)
            .pushFloat(aimy)
            .send(this.ws);
    }
}
