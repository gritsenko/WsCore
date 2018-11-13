/// <reference path="ReadBuffer.ts" />
/// <reference path="WriteBuffer.ts" />
//MessageType enum builder
enum ServerMessageType {
    GameState = 0,
    PlayersMovment = 1,
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
class MapObjectData {
    objectid: number;
    x: number;
    y: number;
    objecttype: number;
}
class MovmentStateData {
    playerid: number;
    x: number;
    y: number;
    aimx: number;
    aimy: number;
    targetx: number;
    targety: number;
    bodyangle: number;
    controlsstate: number;
    velocityx: number;
    velocityy: number;
    animationstate: number;
}
class PlayerStateData {
    id: number;
    name: string;
    hp: number;
    maxhp: number;
    bodyindex: number;
    weaponindex: number;
    armorindex: number;
    movmentstate: MovmentStateData;
}
class ChatServerMessage {
    clientid: number;
    message: string;
}
class GameStateServerMessage {
    playerstatedata: PlayerStateData[];
}
class InitPlayerServerMessage {
    clientid: number;
}
class MapObjectsServerMessage {
    mapobjects: MapObjectData[];
}
class PlayerJoinedServerMessage {
    playerstatedata: PlayerStateData;
}
class PlayerLeftServerMessage {
    clientid: number;
}
class PlayerRespawnServerMessage {
    playerstatedata: PlayerStateData;
}
class PlayerShootingServerMessage {
    clientid: number;
    weapon: number;
}
class PlayersMovementServerMessage {
    movmentstates: MovmentStateData[];
}
class PlayersTopServerMessage {
    playerstop: string;
}
class SetPlayerHpServerMessage {
    playerid: number;
    playerhp: number;
}
class SetPlayerNameServerMessage {
    clientid: number;
    name: string;
}
class UpdatePlayerSlotsServerMessage {
    playerid: number;
    body: number;
    gun: number;
    armor: number;
}
class ChatClientMessage {
    message: string;
}
class GetMapObjectsClientMessage {
    mapx: number;
    mapy: number;
}
class GetTilesClientMessage {
    mapx: number;
    mapy: number;
}
class PlayerHitClientMessage {
    playeid: number;
    hitpoints: number;
}
class PlayerRespawnClientMessage {
    playerid: number;
}
class PlayerShootingClientMessage {
    weapon: number;
}
class SetPlayerNameClientMessage {
    name: string;
}
class UpdatePlayerSlotsClientMessage {
    body: number;
    gun: number;
    armor: number;
}
class UpdatePlayerStateClientMessage {
    aimx: number;
    aimy: number;
    controlsstate: number;
}
class UpdatePlayerTargetClientMessage {
    aimx: number;
    aimy: number;
}
class Wsc {

    clientId = -1;
    writeBuff = new WriteBuffer();
    readBuff = new ReadBuffer();
    ws: WebSocket;
    overrideUrl: string;
    constructor() {
    }

    connect(overrideUrl: string = null) {
        this.ws = this.createSocket();
        this.overrideUrl = overrideUrl;
    }
    createSocket() {
        const scheme = document.location.protocol == "https:" ? "wss" : "ws";
        const port = document.location.port ? (":" + document.location.port) : "";
        const serverUrl = scheme + "://" + document.location.hostname + port + "/ws";

        this.ws = new WebSocket(this.overrideUrl == undefined ? serverUrl : this.overrideUrl);
        this.ws.binaryType = "arraybuffer";
        this.ws.onmessage = e => this.processServerMessage(new ReadBuffer().setInput(e.data));
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
    readMapObjectData(buff) {
        const obj = new MapObjectData();
        obj.objectid = buff.popUInt32();
        obj.x = buff.popFloat();
        obj.y = buff.popFloat();
        obj.objecttype = buff.popUInt32();
        return obj;
    }
    readMovmentStateData(buff) {
        const obj = new MovmentStateData();
        obj.playerid = buff.popUInt32();
        obj.x = buff.popFloat();
        obj.y = buff.popFloat();
        obj.aimx = buff.popFloat();
        obj.aimy = buff.popFloat();
        obj.targetx = buff.popFloat();
        obj.targety = buff.popFloat();
        obj.bodyangle = buff.popInt32();
        obj.controlsstate = buff.popInt32();
        obj.velocityx = buff.popFloat();
        obj.velocityy = buff.popFloat();
        obj.animationstate = buff.popInt32();
        return obj;
    }
    readPlayerStateData(buff) {
        const obj = new PlayerStateData();
        obj.id = buff.popUInt32();
        obj.name = buff.popStringFixedLength(32);
        obj.hp = buff.popUInt8();
        obj.maxhp = buff.popUInt8();
        obj.bodyindex = buff.popInt32();
        obj.weaponindex = buff.popInt32();
        obj.armorindex = buff.popInt32();
        obj.movmentstate = this.readMovmentStateData(buff);
        return obj;
    }
    //Message readers
    onChatMessage(msg: ChatServerMessage) {
    }
    onGameState(msg: GameStateServerMessage) {
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
    onPlayersMovment(msg: PlayersMovementServerMessage) {
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
                var chatmessageMessage = new ChatServerMessage();
                chatmessageMessage.clientid = buff.popUInt32();
                chatmessageMessage.message = buff.popStringFixedLength(256);
                this.onChatMessage(chatmessageMessage);
                break;
            case ServerMessageType.GameState:
                var gamestateMessage = new GameStateServerMessage();
                gamestateMessage.playerstatedata = this.readArray(buff, b => { return this.readPlayerStateData(b); });
                this.onGameState(gamestateMessage);
                break;
            case ServerMessageType.InitPlayer:
                var initplayerMessage = new InitPlayerServerMessage();
                initplayerMessage.clientid = buff.popUInt32();
                this.onInitPlayer(initplayerMessage);
                break;
            case ServerMessageType.MapObjects:
                var mapobjectsMessage = new MapObjectsServerMessage();
                mapobjectsMessage.mapobjects = this.readArray(buff, b => { return this.readMapObjectData(b); });
                this.onMapObjects(mapobjectsMessage);
                break;
            case ServerMessageType.PlayerJoined:
                var playerjoinedMessage = new PlayerJoinedServerMessage();
                playerjoinedMessage.playerstatedata = this.readPlayerStateData(buff);
                this.onPlayerJoined(playerjoinedMessage);
                break;
            case ServerMessageType.PlayerLeft:
                var playerleftMessage = new PlayerLeftServerMessage();
                playerleftMessage.clientid = buff.popUInt32();
                this.onPlayerLeft(playerleftMessage);
                break;
            case ServerMessageType.RespawnPlayer:
                var respawnplayerMessage = new PlayerRespawnServerMessage();
                respawnplayerMessage.playerstatedata = this.readPlayerStateData(buff);
                this.onRespawnPlayer(respawnplayerMessage);
                break;
            case ServerMessageType.PlayerShooting:
                var playershootingMessage = new PlayerShootingServerMessage();
                playershootingMessage.clientid = buff.popUInt32();
                playershootingMessage.weapon = buff.popInt32();
                this.onPlayerShooting(playershootingMessage);
                break;
            case ServerMessageType.PlayersMovment:
                var playersmovmentMessage = new PlayersMovementServerMessage();
                playersmovmentMessage.movmentstates = this.readArray(buff, b => { return this.readMovmentStateData(b); });
                this.onPlayersMovment(playersmovmentMessage);
                break;
            case ServerMessageType.PlayersTop:
                var playerstopMessage = new PlayersTopServerMessage();
                playerstopMessage.playerstop = buff.popStringFixedLength(1024);
                this.onPlayersTop(playerstopMessage);
                break;
            case ServerMessageType.PlayerSetHp:
                var playersethpMessage = new SetPlayerHpServerMessage();
                playersethpMessage.playerid = buff.popUInt32();
                playersethpMessage.playerhp = buff.popUInt8();
                this.onPlayerSetHp(playersethpMessage);
                break;
            case ServerMessageType.SetPlayerName:
                var setplayernameMessage = new SetPlayerNameServerMessage();
                setplayernameMessage.clientid = buff.popUInt32();
                setplayernameMessage.name = buff.popStringFixedLength(32);
                this.onSetPlayerName(setplayernameMessage);
                break;
            case ServerMessageType.UpdatePlayerSlots:
                var updateplayerslotsMessage = new UpdatePlayerSlotsServerMessage();
                updateplayerslotsMessage.playerid = buff.popUInt32();
                updateplayerslotsMessage.body = buff.popInt32();
                updateplayerslotsMessage.gun = buff.popInt32();
                updateplayerslotsMessage.armor = buff.popInt32();
                this.onUpdatePlayerSlots(updateplayerslotsMessage);
                break;
        }
    }
    //Message senders
    sendChatMessage(message: string) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.ChatMessage)
            .pushString(message, 256)
            .send(this.ws);
    }
    sendGetMapObjects(mapx: number, mapy: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetMapObjects)
            .pushInt32(mapx)
            .pushInt32(mapy)
            .send(this.ws);
    }
    sendGetTiles(mapx: number, mapy: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.GetTiles)
            .pushInt32(mapx)
            .pushInt32(mapy)
            .send(this.ws);
    }
    sendHitPlayer(playeid: number, hitpoints: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.HitPlayer)
            .pushUInt32(playeid)
            .pushInt32(hitpoints)
            .send(this.ws);
    }
    sendRespawnPlayer(playerid: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.RespawnPlayer)
            .pushUInt32(playerid)
            .send(this.ws);
    }
    sendPlayerShooting(weapon: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.PlayerShooting)
            .pushInt32(weapon)
            .send(this.ws);
    }
    sendSetPlayerName(name: string) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.SetPlayerName)
            .pushString(name, 32)
            .send(this.ws);
    }
    sendUpdatePlayerSlots(body: number, gun: number, armor: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerSlots)
            .pushInt32(body)
            .pushInt32(gun)
            .pushInt32(armor)
            .send(this.ws);
    }
    sendUpdatePlayerState(aimx: number, aimy: number, controlsstate: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerState)
            .pushFloat(aimx)
            .pushFloat(aimy)
            .pushInt32(controlsstate)
            .send(this.ws);
    }
    sendUpdatePlayerTarget(aimx: number, aimy: number) {
        this.writeBuff.newMessage()
            .pushUInt8(ClientMessageType.UpdatePlayerTarget)
            .pushFloat(aimx)
            .pushFloat(aimy)
            .send(this.ws);
    }
}
