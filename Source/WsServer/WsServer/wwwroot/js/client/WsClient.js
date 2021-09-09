import Wsc from "./WsConnection.js";
import Player from "./Player.js";

export default class WsClient extends Wsc {

    myPlayer;
    myPlayerName = "John Smith";
    playersCount = 0;
    players = [];

    onPlayerCreateCallback;
    onGameInitCallback;
    onMapObjectsCallback;
    onPlayerRemovedCallback;


    onInitPlayer(msg) {
        this.clientId = msg.ClientId;
        this.sendSetPlayerName(this.myPlayerName);
        this.sendUpdatePlayerSlots(0, 0, 0);

        if (this.onGameInitCallback != undefined)
            this.onGameInitCallback();
    }

    onSetPlayerName(msg) {
        if (this.players[msg.ClientId] != null) {
            this.players[msg.ClientId].updateName(msg.Name);
        }
    }

    onChatMessage(msg) {
        this.writeToChat(msg.ClientId, msg.Message);
    }

    onPlayerJoined(msg) {
        this.updatePlayer(msg.PlayerStateData);
    }

    onPlayerLeft(msg) {
        this.removePlayer(msg.ClientId);
    }


    onGameState(msg) {
        const playersCount = msg.PlayerStateData.length;
        for (let i = 0; i < playersCount; i++) {
            this.updatePlayer(msg.PlayerStateData[i]);
        }
    }

    onPlayersMovment(msg) {
        const playersCount = msg.MovmentStates.length;

        for (let i = 0; i < playersCount; i++) {
            const state = msg.MovmentStates[i];

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

    onMapObjects(msg) {
        this.onMapObjectsCallback?.(msg.MapObjects);
    }


    //onRespawnPlayer(msg: PlayerRespawnServerMessage) {
    //}

    //onPlayerShooting(msg: PlayerShootingServerMessage) {
    //}

    //onPlayersTop(msg: PlayersTopServerMessage) {
    //}

    //onPlayerSetHp(msg: SetPlayerHpServerMessage) {
    //}

    //onUpdatePlayerSlots(msg: UpdatePlayerSlotsServerMessage) {
    //}

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

    setPlayerData(p, pd) {
        p.name = pd.Name.trim();
        p.hp = pd.HP;
        p.maxHp = pd.MaxHp;
        p.body = pd.BodyIndex;
        p.weapon = pd.WeaponIndex;
        p.armor = pd.ArmorIndex;

        const ms = pd.MovmentState;
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