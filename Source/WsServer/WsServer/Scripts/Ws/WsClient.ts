import Wsc from "./WsConnection.js";
import Player from "../Player.js";
import * as WsConnection from "./WsConnection.js";

export default class WsClient extends Wsc {

    myPlayer: Player;
    myPlayerName = "John Smith";
    playersCount = 0;
    players = [];

    onPlayerCreateCallback: Function;
    onGameInitCallback: Function;
    onMapObjectsCallback: Function;
    onPlayerRemovedCallback: Function;
    
    onInitPlayerEvent(msg) {
        this.clientId = msg.ClientId;
        this.sendSetPlayerNameRequest(this.myPlayerName);
        this.sendUpdatePlayerSlotsRequest(0, 0, 0);

        this.onGameInitCallback?.();
    }

    onSetPlayerNameEvent(msg) {
        if (this.players[msg.ClientId] != null) {
            this.players[msg.ClientId].updateName(msg.Name);
        }
    }

    onChatMessageEvent(msg) {
        this.writeToChat(msg.ClientId, msg.Message);
    }

    onPlayerJoinedEvent(msg: WsConnection.PlayerJoinedEvent) {
        this.updatePlayer(msg.PlayerStateData);
    }

    onPlayerLeftEvent(msg: WsConnection.PlayerLeftEvent) {
        this.removePlayer(msg.ClientId);
    }
    
    onGameStateUpdateEvent(msg: WsConnection.GameStateUpdateEvent) {
        const playersCount = msg.PlayerStateData.length;
        for (let i = 0; i < playersCount; i++) {
            this.updatePlayer(msg.PlayerStateData[i]);
        }
    }

    onGameTickUpdateEvent(msg: WsConnection.GameTickUpdateEvent) {
        const playersCount = msg.MovementStates.length;

        for (let i = 0; i < playersCount; i++) {
            const state = msg.MovementStates[i];

            const playerId = state.PlayerId;
            const p = this.players[playerId];

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
    }

    onMapObjectsEvent(msg) {
        this.onMapObjectsCallback?.(msg.MapObjects);
    }

    writeToChat(id, message) {
        console.log(`Message to chat from client ${id}: ${message}`);
    }

    removePlayer(clientId) {
        const player = this.players[clientId];
        this.players.splice(this.players.indexOf(player), 1);
        this.onPlayerRemovedCallback?.(player);

        player.destroy();
    }

    updatePlayer(playerData) {
        let player = null;
        let isNewPlayer = false;
        const playerId = playerData.Id;

        if (playerId in this.players) {
            player = this.players[playerId];
        } else {
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
    }

    setPlayerData(p, pd: WsConnection.PlayerStateData) {
        p.name = pd.Name.trim();
        p.hp = pd.Hp;
        p.maxHp = pd.MaxHp;
        p.body = pd.BodyIndex;
        p.weapon = pd.WeaponIndex;
        p.armor = pd.ArmorIndex;

        const ms = pd.MovementState;
        p.x = ms.X;
        p.y = ms.Y;
        p.ax = ms.AimX;
        p.ay = ms.AimY;
        p.angle = ms.BodyAngle;
        p.controls = ms.ControlsState;
        p.speed.x = ms.VelocityX;
        p.speed.y = ms.VelocityY;
    }
}